/**
 * Routes and the guards around them. Contributors land on /, admins and viewers on /admin
 * (docs/DESIGN.md "Screens to routes").
 */

import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { AppRole } from '@gtm/shared';
import { useAuth } from './auth.jsx';
import { AppShell } from './components/AppShell.jsx';
import { Loading } from './components/ui.jsx';

import {
  ForgotPassword,
  NoAccess,
  ResetPassword,
  SetPassword,
  SignIn,
} from './features/auth/SignIn.jsx';
import { Home } from './features/home/Home.jsx';
import { Landing } from './features/landing/Landing.jsx';
import { DailyLog } from './features/daily-log/DailyLog.jsx';
import { WeeklyLog } from './features/weekly-log/WeeklyLog.jsx';
import { MyTasks } from './features/tasks/MyTasks.jsx';
import { AbmTracker } from './features/abm/AbmTracker.jsx';
import { Dashboard } from './features/dashboard/Dashboard.jsx';
import { People } from './features/people/People.jsx';
import { PersonDetail } from './features/people/PersonDetail.jsx';
import { TaskManagement } from './features/task-admin/TaskManagement.jsx';
import { Settings } from './features/settings/Settings.jsx';
import { CalendarScreen } from './features/calendar/CalendarScreen.jsx';
import { WeeklyReport } from './features/report/WeeklyReport.jsx';

function Guard({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading what="Opening the tracker" />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === 'contributor' ? '/' : '/admin'} replace />;
  }
  return <AppShell>{children}</AppShell>;
}

const ALL: AppRole[] = ['admin', 'contributor', 'viewer'];
const CONTRIBUTOR: AppRole[] = ['contributor'];
const MANAGER: AppRole[] = ['admin', 'viewer'];
const ADMIN: AppRole[] = ['admin'];

export function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* public */}
      <Route
        path="/signin"
        element={
          loading ? (
            <Loading what="Opening the tracker" />
          ) : user ? (
            <Navigate to={user.role === 'contributor' ? '/' : '/admin'} replace />
          ) : (
            <SignIn />
          )
        }
      />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/no-access" element={<NoAccess />} />

      {/* contributor */}
      {/* "/" is the public landing page when signed out, and the contributor home when in. */}
      <Route
        path="/"
        element={
          loading ? (
            <Loading what="Opening the tracker" />
          ) : !user ? (
            <Landing />
          ) : user.role === 'contributor' ? (
            <Guard roles={CONTRIBUTOR}>
              <Home />
            </Guard>
          ) : (
            <Navigate to="/admin" replace />
          )
        }
      />
      <Route
        path="/daily"
        element={
          <Guard roles={CONTRIBUTOR}>
            <DailyLog />
          </Guard>
        }
      />
      <Route
        path="/daily/:date"
        element={
          <Guard roles={CONTRIBUTOR}>
            <DailyLog />
          </Guard>
        }
      />
      <Route
        path="/weekly"
        element={
          <Guard roles={CONTRIBUTOR}>
            <WeeklyLog />
          </Guard>
        }
      />
      <Route
        path="/weekly/:monday"
        element={
          <Guard roles={CONTRIBUTOR}>
            <WeeklyLog />
          </Guard>
        }
      />
      <Route
        path="/tasks"
        element={
          <Guard roles={CONTRIBUTOR}>
            <MyTasks />
          </Guard>
        }
      />
      <Route
        path="/tasks/:id"
        element={
          <Guard roles={CONTRIBUTOR}>
            <MyTasks />
          </Guard>
        }
      />

      {/* everyone */}
      <Route
        path="/abm"
        element={
          <Guard roles={ALL}>
            <AbmTracker />
          </Guard>
        }
      />

      {/* manager */}
      <Route
        path="/admin"
        element={
          <Guard roles={MANAGER}>
            <Dashboard />
          </Guard>
        }
      />
      <Route
        path="/people"
        element={
          <Guard roles={MANAGER}>
            <People />
          </Guard>
        }
      />
      <Route
        path="/people/:id"
        element={
          <Guard roles={MANAGER}>
            <PersonDetail />
          </Guard>
        }
      />
      <Route
        path="/report"
        element={
          <Guard roles={MANAGER}>
            <WeeklyReport />
          </Guard>
        }
      />
      <Route
        path="/report/:monday"
        element={
          <Guard roles={MANAGER}>
            <WeeklyReport />
          </Guard>
        }
      />
      <Route
        path="/admin/tasks"
        element={
          <Guard roles={ADMIN}>
            <TaskManagement />
          </Guard>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <Guard roles={ADMIN}>
            <Settings />
          </Guard>
        }
      />
      <Route
        path="/admin/calendar"
        element={
          <Guard roles={ADMIN}>
            <CalendarScreen />
          </Guard>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
