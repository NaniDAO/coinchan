import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/positions/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/positions/"!</div>
}
