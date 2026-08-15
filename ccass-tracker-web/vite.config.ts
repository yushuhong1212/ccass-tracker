import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 业务代码 / 图表引擎(recharts+d3) / 其余依赖 三块：
        // 业务代码改动不影响后两者的哈希，日常迭代下用户缓存命中率高。
        // 注意只把 recharts 生态单独拆出——react 与 radix 等依赖相互引用，
        // 拆得更细会产生循环 chunk 警告。
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](recharts|d3-|victory-vendor|react-smooth|recharts-scale)[\\/]/.test(id)) return "charts";
          return "vendor";
        },
      },
    },
  },
});
