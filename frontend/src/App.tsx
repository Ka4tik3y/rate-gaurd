import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { LoadingState } from '@/components/ui/states'

const Overview = lazy(() => import('@/pages/Overview'))
const TestConsole = lazy(() => import('@/pages/TestConsole'))
const Traffic = lazy(() => import('@/pages/Traffic'))
const Clients = lazy(() => import('@/pages/Clients'))
const ClientDetail = lazy(() => import('@/pages/ClientDetail'))
const Policies = lazy(() => import('@/pages/Policies'))
const Agent = lazy(() => import('@/pages/Agent'))
const Investigations = lazy(() => import('@/pages/Investigations'))
const InvestigationDetail = lazy(() => import('@/pages/InvestigationDetail'))
const PolicyGate = lazy(() => import('@/pages/PolicyGate'))
const Simulation = lazy(() => import('@/pages/Simulation'))
const Audit = lazy(() => import('@/pages/Audit'))
const Evaluation = lazy(() => import('@/pages/Evaluation'))
const Health = lazy(() => import('@/pages/Health'))
const Settings = lazy(() => import('@/pages/Settings'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<LoadingState className="h-screen" label="Loading…" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Overview />} />
          <Route path="/test" element={<TestConsole />} />
          <Route path="/traffic" element={<Traffic />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:clientId" element={<ClientDetail />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/investigations" element={<Investigations />} />
          <Route path="/investigations/:id" element={<InvestigationDetail />} />
          <Route path="/policy-gate" element={<PolicyGate />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/evaluation" element={<Evaluation />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
