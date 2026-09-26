import { useState } from 'react';
import { useData } from './lib/store';
import ChatScreen from './screens/ChatScreen';
import TodayScreen from './screens/TodayScreen';
import WorkoutsScreen from './screens/WorkoutsScreen';
import WeightScreen from './screens/WeightScreen';
import ProfileScreen from './screens/ProfileScreen';

export type Tab = 'chat' | 'today' | 'workouts' | 'weight' | 'profile';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat', label: 'צ׳אט', icon: '💬' },
  { id: 'today', label: 'יומן', icon: '🍽️' },
  { id: 'workouts', label: 'אימונים', icon: '🏋️' },
  { id: 'weight', label: 'משקל', icon: '⚖️' },
  { id: 'profile', label: 'פרופיל', icon: '👤' },
];

export default function App() {
  const data = useData();
  const needsSetup = !data.profile || !data.settings.apiKey;
  const [tab, setTab] = useState<Tab>(needsSetup ? 'profile' : 'chat');

  return (
    <div className="app">
      <main className="screen">
        {tab === 'chat' && <ChatScreen goTo={setTab} />}
        {tab === 'today' && <TodayScreen />}
        {tab === 'workouts' && <WorkoutsScreen />}
        {tab === 'weight' && <WeightScreen />}
        {tab === 'profile' && <ProfileScreen onDone={() => setTab('chat')} />}
      </main>
      <nav className="tabbar" aria-label="ניווט ראשי">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
