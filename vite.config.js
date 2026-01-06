import { join, dirname } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";

const path = fileURLToPath(import.meta.url);

export default {
  root: join(dirname(path), "client"),
  plugins: [react()],
  server: {
    hmr: false,
    watch: null,
  },
  // 完全禁用 HMR client 注入
  define: {
    'import.meta.hot': 'undefined',
  },
};
