use crate::error::{MezzanineError, MezzanineResult};
use crate::roster::scientist::ScientistId;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

const RESPONSE_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatItem {
    id: String,
    kind: String,
    phase: Option<String>,
    text: String,
    label: String,
    truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    id: String,
    items: Vec<ChatItem>,
    omitted_items: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPage {
    pub thread_id: String,
    turns: Vec<ChatTurn>,
    next_cursor: Option<String>,
}

fn bounded(text: &str, max: usize) -> (String, bool) {
    let mut chars = text.chars();
    let kept: String = chars.by_ref().take(max).collect();
    (kept, chars.next().is_some())
}

fn text(value: &Value, field: &str) -> String {
    value[field].as_str().unwrap_or_default().to_string()
}

fn item(value: &Value) -> Option<ChatItem> {
    let id = value["id"].as_str()?.to_string();
    let (kind, label, content) = match value["type"].as_str()? {
        "agentMessage" | "plan" => ("assistant", String::new(), text(value, "text")),
        "userMessage" => {
            let content = value["content"]
                .as_array()?
                .iter()
                .filter_map(|part| match part["type"].as_str()? {
                    "text" => part["text"].as_str().map(str::to_string),
                    "image" | "localImage" => {
                        Some("[Image attached — available in CLI controls]".into())
                    }
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            ("user", String::new(), content)
        }
        "commandExecution" => {
            let exit = value["exitCode"]
                .as_i64()
                .map(|n| format!("\nExit code: {n}"))
                .unwrap_or_default();
            (
                "tool",
                bounded(&text(value, "command"), 180).0,
                format!("{}{}", text(value, "aggregatedOutput"), exit),
            )
        }
        "mcpToolCall" => (
            "tool",
            format!("{} · {}", text(value, "server"), text(value, "tool")),
            serde_json::to_string_pretty(&json!({"result":value["result"],"error":value["error"]}))
                .unwrap_or_default(),
        ),
        "fileChange" => (
            "tool",
            "File changes".into(),
            serde_json::to_string_pretty(&value["changes"]).unwrap_or_default(),
        ),
        "webSearch" => ("tool", "Web search".into(), text(value, "query")),
        // Reasoning, instructions, and unknown protocol items are not chat messages.
        _ => return None,
    };
    let (content, truncated) = bounded(&content, if kind == "tool" { 6000 } else { 48000 });
    Some(ChatItem {
        id,
        kind: kind.into(),
        phase: value["phase"].as_str().map(str::to_string),
        text: content,
        label,
        truncated,
    })
}

fn project(thread: &str, value: Value) -> MezzanineResult<ChatPage> {
    let rows = value["data"]
        .as_array()
        .ok_or_else(|| MezzanineError::Chronicle("Codex returned no conversation page".into()))?;
    let mut turns = Vec::new();
    for row in rows.iter().take(4).rev() {
        let id = row["id"].as_str().ok_or_else(|| {
            MezzanineError::Chronicle("Codex returned a turn without an ID".into())
        })?;
        let all: Vec<_> = row["items"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(item)
            .collect();
        let omitted_items = all.len().saturating_sub(200);
        turns.push(ChatTurn {
            id: id.into(),
            items: all.into_iter().skip(omitted_items).collect(),
            omitted_items,
        });
    }
    Ok(ChatPage {
        thread_id: thread.into(),
        turns,
        next_cursor: value["nextCursor"].as_str().map(str::to_string),
    })
}

pub struct ChatReader {
    scientist: ScientistId,
    thread: String,
    child: Child,
    stdin: Option<ChildStdin>,
    incoming: Receiver<Result<Value, String>>,
    sequence: u64,
}

impl ChatReader {
    pub fn spawn(
        root: &Path,
        distro: Option<&str>,
        scientist: ScientistId,
        thread: &str,
    ) -> MezzanineResult<Self> {
        let mut command = crate::drydock::bridge::command_in_lab(
            root,
            "codex",
            &["app-server", "--stdio"],
            distro,
        );
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let child = command.spawn()?;
        Self::from_child(child, scientist, thread)
    }

    fn from_child(mut child: Child, scientist: ScientistId, thread: &str) -> MezzanineResult<Self> {
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| MezzanineError::Chronicle("Codex stdout is unavailable".into()))?;
        let stdin = child.stdin.take();
        let (tx, incoming) = mpsc::sync_channel(8);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut line = Vec::new();
                // Bound a single response without relying on read_until allocating
                // arbitrarily before a hostile/broken process finally sends a newline.
                let read = std::io::Read::take(&mut reader, RESPONSE_LIMIT as u64 + 1)
                    .read_until(b'\n', &mut line);
                match read {
                    Ok(0) => break,
                    Ok(_) if line.len() <= RESPONSE_LIMIT => {
                        let result =
                            serde_json::from_slice::<Value>(&line).map_err(|e| e.to_string());
                        if result.as_ref().is_ok_and(|v| v.get("id").is_none()) {
                            continue;
                        }
                        if tx.send(result).is_err() {
                            break;
                        }
                    }
                    _ => {
                        let _ = tx.send(Err(
                            "Codex response exceeded the reader limit or its pipe failed".into(),
                        ));
                        break;
                    }
                }
            }
        });
        let mut reader = Self {
            scientist,
            thread: thread.into(),
            child,
            stdin,
            incoming,
            sequence: 0,
        };
        reader.request("initialize", json!({"clientInfo":{"name":"mezzanine_reader","title":"The Mezzanine","version":env!("CARGO_PKG_VERSION")}}))?;
        reader.send(json!({"method":"initialized"}))?;
        Ok(reader)
    }

    pub fn matches(&self, scientist: ScientistId, thread: &str) -> bool {
        self.scientist == scientist && self.thread == thread
    }

    pub fn belongs_to(&self, scientist: ScientistId) -> bool {
        self.scientist == scientist
    }

    fn send(&mut self, value: Value) -> MezzanineResult<()> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| MezzanineError::Chronicle("Conversation reader closed".into()))?;
        serde_json::to_writer(&mut *stdin, &value)?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        Ok(())
    }

    fn request(&mut self, method: &str, params: Value) -> MezzanineResult<Value> {
        self.sequence += 1;
        self.send(json!({"id":self.sequence,"method":method,"params":params}))?;
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let response = self
                .incoming
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .map_err(|_| {
                    MezzanineError::Chronicle(
                        "Codex conversation read timed out or disconnected".into(),
                    )
                })?
                .map_err(MezzanineError::Chronicle)?;
            if response["id"].as_u64() != Some(self.sequence) {
                continue;
            }
            if let Some(error) = response.get("error") {
                return Err(MezzanineError::Chronicle(format!(
                    "Codex: {}",
                    error["message"]
                        .as_str()
                        .unwrap_or("conversation unavailable")
                )));
            }
            return response
                .get("result")
                .cloned()
                .ok_or_else(|| MezzanineError::Chronicle("Codex returned no result".into()));
        }
    }

    pub fn page(&mut self, cursor: Option<String>) -> MezzanineResult<ChatPage> {
        let result = self.request("thread/turns/list", json!({"threadId":self.thread,"limit":4,"itemsView":"full","sortDirection":"desc","cursor":cursor}))?;
        project(&self.thread, result)
    }
}

impl Drop for ChatReader {
    fn drop(&mut self) {
        // stdio EOF lets Codex shut down its own subprocesses. Kill only our
        // reader if it fails to exit; never touch the interactive CLI or thread.
        self.stdin.take();
        for _ in 0..20 {
            if self.child.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Explicit opt-in, read-only native smoke against a supplied exact thread.
    #[test]
    #[ignore = "requires an exact live thread and the host's Codex installation"]
    fn live_exact_thread_read() {
        let root = std::env::var("MEZZANINE_READER_ROOT").expect("explicit root");
        let thread = std::env::var("MEZZANINE_READER_THREAD").expect("explicit thread");
        uuid::Uuid::parse_str(&thread).expect("thread UUID");
        let distro = std::env::var("MEZZANINE_READER_DISTRO").ok();
        let mut reader = ChatReader::spawn(
            Path::new(&root),
            distro.as_deref(),
            ScientistId::new(),
            &thread,
        )
        .unwrap();
        let first = reader.page(None).unwrap();
        assert_eq!(first.thread_id, thread);
        assert!(!first.turns.is_empty());
        let second = reader.page(None).unwrap();
        assert_eq!(second.thread_id, thread);
        println!(
            "Read {} recent turns twice from the exact thread; no turn started or resumed.",
            second.turns.len()
        );
        reader.stdin.take();
        for _ in 0..40 {
            if let Some(status) = reader.child.try_wait().unwrap() {
                assert!(status.success());
                println!("The real reader exited successfully on stdin EOF within two seconds.");
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("The real reader did not exit promptly on stdin EOF");
    }

    #[test]
    fn projection_keeps_messages_and_evidence_but_not_reasoning_or_false_live_status() {
        let page = project("thread", json!({"data":[{"id":"turn","status":"interrupted","items":[
            {"id":"u","type":"userMessage","content":[{"type":"text","text":"hello"}]},
            {"id":"r","type":"reasoning","content":["private"]},
            {"id":"a","type":"agentMessage","phase":"final","text":"**answer**"},
            {"id":"c","type":"commandExecution","command":"npm test","aggregatedOutput":"passed","exitCode":0}
        ]}],"nextCursor":"older"})).unwrap();
        let result = serde_json::to_value(page).unwrap();
        assert_eq!(result["turns"][0]["items"].as_array().unwrap().len(), 3);
        assert_eq!(result["turns"][0]["items"][1]["phase"], "final");
        assert!(!result.to_string().contains("private"));
        assert!(!result.to_string().contains("interrupted"));
        assert_eq!(result["nextCursor"], "older");
    }

    #[test]
    fn truncation_is_unicode_safe_and_disclosed() {
        let result = item(&json!({"id":"c","type":"commandExecution","command":"test","aggregatedOutput":"🧪".repeat(7000)})).unwrap();
        assert_eq!(result.text.chars().count(), 6000);
        assert!(result.truncated);
    }

    #[cfg(unix)]
    #[test]
    fn real_pipes_only_initialize_and_read_an_exact_thread_then_close() {
        let script = r#"import sys,json
for line in sys.stdin:
 m=json.loads(line)
 if m['method']=='initialized': continue
 if m['method']=='initialize': result={}
 elif m['method']=='thread/turns/list' and m['params']['threadId']=='exact-thread': result={'data':[],'nextCursor':None}
 else: raise Exception('unexpected mutating method')
 print(json.dumps({'id':m['id'],'result':result}),flush=True)
"#;
        let child = std::process::Command::new("python3")
            .arg("-u")
            .arg("-c")
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut reader = ChatReader::from_child(child, ScientistId::new(), "exact-thread").unwrap();
        assert!(reader.page(None).unwrap().turns.is_empty());
        assert!(reader.page(Some("older".into())).unwrap().turns.is_empty());
        reader.stdin.take();
        assert!(reader.child.wait().unwrap().success());
    }
}
