import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // 相对路径 base：便于部署到任意子路径（CloudBase/Vercel/静态托管）
  base: './',
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: true, // 允许手机通过局域网 IP 访问 dev server 实测
  },
})
