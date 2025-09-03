import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/explore/pools')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/explore/pools"!</div>
}
