import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl font-bold text-faint">404</div>
      <p className="mt-2 text-sm text-muted">This page does not exist.</p>
      <Link to="/dashboard" className="btn-primary mt-5">
        Back to overview
      </Link>
    </div>
  )
}
