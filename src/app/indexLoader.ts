// `/` 는 화면이 없다. 공통 상태 쿼리(service · range · refresh)를 그대로 들고 Service map 으로 보낸다.
import { redirect, type LoaderFunctionArgs } from 'react-router'

// <Navigate> 로 옮기지 않는다 : 렌더 뒤 effect 로 가면 AppLayout 의 필터 URL 동기화(setParams)와 같은 틱에 경합해
// 뒤에 실행된 setParams 가 `/?range=…` 로 되돌리고, 같은 경로라 <Navigate> 는 다시 안 돌아 본문이 빈 채로 남는다
export function indexLoader({ request }: LoaderFunctionArgs) {
  return redirect(`/server-map${new URL(request.url).search}`)
}
