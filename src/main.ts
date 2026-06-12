import {createApp} from 'vue';
import 'virtual:uno.css';
import '@xterm/xterm/css/xterm.css';
// The auxiliary sheet earns its first real cargo in #00059: the Caveat
// @font-face pair the field-journal floor writes its captions in.
import './assets/mezzanine.css';
import App from './App.vue';

createApp(App).mount('#app');
