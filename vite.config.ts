import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // vendor-echarts(ECharts 본체)만 500 kB 를 넘는다 (크기는 npm run build 출력 참고). 쓰는 화면에서만 내려받으므로 기준을 그만큼 올린다
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // 무거운 라이브러리는 따로 떼어 여러 화면이 같은 파일을 캐시로 나눠 쓰게 한다.
        // 쓰는 화면(lazy)에서만 내려받고, 첫 화면 공통 파일(index)에는 들어가지 않는다.
        codeSplitting: {
          groups: [
            // 그룹은 잡은 모듈이 쓰는 라이브러리까지 같이 끌고 간다(includeDependenciesRecursively 기본값).
            // React 를 먼저(priority 높게) 따로 잡아 두지 않으면 React 가 vendor-xyflow 로 딸려 가 첫 화면이 그 파일을 통째로 받는다
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
            { name: 'vendor-echarts', test: /node_modules[\\/](echarts|zrender)[\\/]/ },
            { name: 'vendor-xyflow', test: /node_modules[\\/](@xyflow|@dagrejs|d3-[a-z-]+|classcat)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    // 로컬에서 api-server(8080)를 켜 두면 /api 요청을 그쪽으로 넘긴다
    proxy: { '/api': 'http://localhost:8080' },
  },
})
