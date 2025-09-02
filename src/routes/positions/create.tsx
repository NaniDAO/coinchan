import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/positions/create')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/positions/create"!</div>
}
