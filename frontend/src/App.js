import React, { useState, useCallback, useEffect } from 'react';
import './App.css';
import TopNav from './components/TopNav';
import ClientHeader from './components/ClientHeader';
import CheckinHub from './components/CheckinHub';
import LoomModal from './components/LoomModal';
import ClientManager from './components/ClientManager';
import MessagesTab from './components/MessagesTab';
import ScheduledPostsTab from './components/ScheduledPostsTab';
import SettingsTab from './components/SettingsTab';
import ClientOverviewTab from './components/ClientOverviewTab';
import TrainingTab from './components/TrainingTab';
import NutritionTab from './components/NutritionTab';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const CLIENT_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'training', label: 'Training' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'recovery', label: 'Recovery' },
];

const COACH_TABS = [
  { key: 'clients', label: 'Clients' },
  { key: 'messages', label: 'Messages' },
  { key: 'scheduled-posts', label: 'Scheduled Posts' },
  { key: 'settings', label: 'Settings' },
];

function App() {
  const [activeTab, setActiveTab] = useState('client');
  const [clientTab, setClientTab] = useState('overview');
  const [coachTab, setCoachTab] = useState('clients');
  const [hubOpen, setHubOpen] = useState(false);
  const [loomOpen, setLoomOpen] = useState(false);

  // Client selection state
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [detailRefresh, setDetailRefresh] = useState(0);

  // Fetch client detail when selection or refresh counter changes
  useEffect(() => {
    if (!selectedClientId) {
      setClientDetail(null);
      return;
    }

    let cancelled = false;

    async function fetchDetail() {
      try {
        const res = await fetch(`${API_BASE}/api/clients/${selectedClientId}/detail`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) setClientDetail(data.client);
      } catch (err) {
        console.error('Failed to fetch client detail:', err);
        if (!cancelled) setClientDetail(null);
      }
    }

    fetchDetail();
    return () => { cancelled = true; };
  }, [selectedClientId, detailRefresh]);

  const toggleHub = useCallback(() => {
    setHubOpen((prev) => !prev);
  }, []);

  const closeHub = useCallback(() => {
    setHubOpen(false);
  }, []);

  const openLoom = useCallback(() => {
    if (selectedClientId) setLoomOpen(true);
  }, [selectedClientId]);

  const closeLoom = useCallback(() => {
    setLoomOpen(false);
  }, []);

  const handleSelectClient = useCallback((clientId, defaultTab) => {
    setSelectedClientId(clientId);
    if (defaultTab) setClientTab(defaultTab);
    setHubOpen(false);
    setActiveTab('client');
    // Warm the cache for this client's Overview data in the background
    fetch(`${API_BASE}/api/clients/${clientId}/prefetch`, { method: 'POST' }).catch(() => {});
  }, []);

  // Refresh client detail (e.g. after sending Loom feedback)
  const refreshClientDetail = useCallback(() => {
    setDetailRefresh((n) => n + 1);
  }, []);

  // Optimistic phase update
  const handlePhaseChange = useCallback((newPhase) => {
    setClientDetail(prev => prev ? { ...prev, currentPhase: newPhase } : prev);
    fetch(`${API_BASE}/api/clients/${selectedClientId}/phase`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_phase: newPhase }),
    }).catch(err => {
      console.error('Failed to update phase:', err);
      setDetailRefresh(n => n + 1);
    });
  }, [selectedClientId]);

  return (
    <div className="app">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'client' && (
        <>
          <ClientHeader
            client={clientDetail}
            onHubToggle={toggleHub}
            onLoomOpen={openLoom}
            onPhaseChange={handlePhaseChange}
            tabs={CLIENT_TABS}
            activeClientTab={clientTab}
            onClientTabChange={setClientTab}
          />
          <CheckinHub
            isOpen={hubOpen}
            onClose={closeHub}
            onSelectClient={handleSelectClient}
          />
          {selectedClientId && (
            <LoomModal
              isOpen={loomOpen}
              onClose={closeLoom}
              clientId={selectedClientId}
              clientName={clientDetail?.name || ''}
              onSent={refreshClientDetail}
            />
          )}
          <main className="content-area">
            {!selectedClientId && (
              <div className="content-area__empty">
                Open the Check-in Hub to select a client
              </div>
            )}
            {selectedClientId && clientTab === 'overview' && (
              <ClientOverviewTab clientId={selectedClientId} />
            )}
            {selectedClientId && clientTab === 'training' && (
              <TrainingTab clientId={selectedClientId} />
            )}
            {selectedClientId && clientTab === 'nutrition' && (
              <NutritionTab clientId={selectedClientId} />
            )}
            {selectedClientId && clientTab === 'recovery' && (
              <div className="content-area__empty">Recovery - coming soon</div>
            )}
          </main>
        </>
      )}
      {activeTab === 'coach' && (
        <>
          <nav className="coach-tabs">
            {COACH_TABS.map(tab => (
              <button
                key={tab.key}
                className={`coach-tabs__tab${coachTab === tab.key ? ' coach-tabs__tab--active' : ''}`}
                onClick={() => setCoachTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="content-area">
            {coachTab === 'clients' && <ClientManager onSelectClient={handleSelectClient} />}
            {coachTab === 'messages' && <MessagesTab />}
            {coachTab === 'scheduled-posts' && <ScheduledPostsTab />}
            {coachTab === 'settings' && <SettingsTab />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
