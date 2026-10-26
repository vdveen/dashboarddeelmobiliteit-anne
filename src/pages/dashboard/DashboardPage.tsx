import React from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import VoiContractMonitor from '../../components/VoiContract/VoiContractMonitor';
import DashboardBeleidszones from './DashboardBeleidszones';
import StatsPage from '../StatsPage';

interface DashboardPageProps {}

function DashboardPage(props: DashboardPageProps) {
  const { dashboard } = useParams<{ dashboard: string }>();
  const location = useLocation();

  if (dashboard === 'beleidsinfo') {
    return <StatsPage />;
  }

  // This fork shows the Voi contract monitor here instead of the permit
  // overview, which does not work for operator or regional accounts
  if (dashboard === 'prestaties-aanbieders') {
    return <VoiContractMonitor />;
  }

  if (dashboard === 'beleidszones') {
    return <DashboardBeleidszones />;
  }

  /* Redirect prestaties-aanbieders-details to prestaties-aanbieders with same query params (unified view) */
  if (dashboard === 'prestaties-aanbieders-details') {
    const search = location.search || '';
    return <Navigate to={`/stats/prestaties-aanbieders${search}`} replace />;
  }

  // Default fallback for unknown dashboard types
  return (
    <div className="DashboardPage pt-4 pb-24">
      <h1>Dashboard niet gevonden</h1>
      <p>Het dashboard "{dashboard}" bestaat niet.</p>
    </div>
  );
}

export default DashboardPage;
