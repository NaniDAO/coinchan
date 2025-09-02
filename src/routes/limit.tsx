import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/limit')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/limit"!</div>
}
