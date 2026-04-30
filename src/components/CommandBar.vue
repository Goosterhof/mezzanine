<script setup lang="ts">
import { ref, onMounted } from "vue";

// The command bar is the always-on instrument tray. The investor's keyboard
// never leaves this input field unless an inline editor takes focus
// (Compose Dispatch in Phase 2A is the only such case in MVP).
//
// `@<experiment>` prefix routing happens here in Phase 1C — until then the
// input is wired but inert.

const input = ref("");
const fieldRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  fieldRef.value?.focus();
});
</script>

<template>
  <footer class="h-12 border-t border-wb-edge bg-wb-command flex items-center px-6 shadow-tray">
    <span class="wb-stamp-label mr-3">Direct</span>
    <input
      ref="fieldRef"
      v-model="input"
      type="text"
      class="flex-1 bg-transparent border-none outline-none text-wb-text font-mono text-sm placeholder:text-wb-text-faint"
      placeholder="Direct the laboratory…"
      autocomplete="off"
      spellcheck="false"
    />
    <span class="wb-stamp-label ml-4">@&lt;exp&gt; routes by name</span>
  </footer>
</template>
