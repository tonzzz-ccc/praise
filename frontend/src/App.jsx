import { ConfigProvider, Result, Spin } from 'antd'
import { Routes, Route, Navigate } from 'react-router-dom'
import AccessProvider from './components/AccessProvider'
import RequireAccess from './components/RequireAccess'
import RequireLogin from './components/RequireLogin'
import { visibleNavigation } from './config/navigation'
import { useAccess } from './hooks/useAccess'
import MainLayout from './layouts/MainLayout'
import AccessManagement from './pages/AccessManagement'
import AwardCategories from './pages/AwardCategories'
import CohApproval from './pages/CohApproval'
import Committee from './pages/Committee'
import Dashboard from './pages/Dashboard'
import Endorsement from './pages/Endorsement'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import NominationForm from './pages/NominationForm'
import Nominations from './pages/Nominations'
import Placeholder from './pages/Placeholder'
import Records from './pages/Records'
import Reports from './pages/Reports'
import Screening from './pages/Screening'
import Settings from './pages/Settings'
import Validation from './pages/Validation'

function FirstAllowedPage() {
  const { can, isReady } = useAccess()
  if (!isReady) return <Spin />

  const [category] = visibleNavigation(can)
  if (!category) {
    return <Result status="403" title="No access" subTitle="No pages have been enabled for this account." />
  }
  return <Navigate to={category.items[0].path} replace />
}

function protectedPage(permission, page) {
  return <RequireAccess permission={permission}>{page}</RequireAccess>
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily: "'DM Sans', sans-serif",
        },
      }}
    >
      <AccessProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route element={<RequireLogin><MainLayout /></RequireLogin>}>
            <Route index element={<FirstAllowedPage />} />
            <Route path="/dashboard" element={protectedPage('dashboard', <Dashboard />)} />
            <Route path="/award-categories" element={protectedPage('award_categories', <AwardCategories />)} />
            <Route path="/nominations" element={protectedPage('nominations', <Nominations />)} />
            <Route path="/nominations/new" element={protectedPage('nominations.create', <NominationForm key="new" />)} />
            <Route path="/nominations/:id/edit" element={protectedPage('nominations.create', <NominationForm key="edit" />)} />
            <Route path="/validation" element={protectedPage('validation', <Validation />)} />
            <Route path="/screening" element={protectedPage('screening', <Screening />)} />
            <Route path="/endorsement" element={protectedPage('endorsement', <Endorsement />)} />
            <Route path="/coh-approval" element={protectedPage('coh_approval', <CohApproval />)} />
            <Route path="/committee" element={protectedPage('committee', <Committee />)} />
            <Route path="/records" element={protectedPage('records', <Records />)} />
            <Route path="/reports" element={protectedPage('reports', <Reports />)} />
            <Route path="/settings" element={protectedPage('settings', <Settings />)} />
            <Route path="/settings/access-management" element={protectedPage('access_management', <AccessManagement />)} />
            <Route path="*" element={<Placeholder title="Page not found" />} />
          </Route>
        </Routes>
      </AccessProvider>
    </ConfigProvider>
  )
}
