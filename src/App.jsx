import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useCall } from './context/CallContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import IncomingCallModal from './components/IncomingCallModal';
import ActiveCallScreen from './components/ActiveCallScreen';

import Auth        from './pages/Auth';
import Home        from './pages/Home';
import Profile     from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Feed        from './pages/Feed';
import Chats       from './pages/Chats';
import Rooms       from './pages/Rooms';
import Clans       from './pages/Clans';
import Friends     from './pages/Friends';

export default function App() {
  const { loading } = useAuth();
  const { incomingCall, activeCall, callStatus } = useCall();

  if (loading) return <LoadingSpinner fullScreen />;

  const showIncoming = !!incomingCall && callStatus === 'ringing' && !activeCall;
  const showActive   = !!activeCall || ['ended', 'declined', 'missed'].includes(callStatus);

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/auth" element={<Auth />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/"                  element={<Home />} />
          <Route path="/profile"          element={<Profile />} />
          <Route path="/profile/:username" element={<UserProfile />} />
          <Route path="/feed"             element={<Feed />} />
          <Route path="/chats"            element={<Chats />} />
          <Route path="/rooms"            element={<Rooms />} />
          <Route path="/clans"            element={<Clans />} />
          <Route path="/friends"          element={<Friends />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showIncoming && <IncomingCallModal />}
      {showActive   && <ActiveCallScreen />}
    </>
  );
}
