import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted">There is no laboratory at this address.</p>
      <Link to="/" className="text-accent hover:text-accent-strong">
        Back to all laboratories
      </Link>
    </div>
  )
}
