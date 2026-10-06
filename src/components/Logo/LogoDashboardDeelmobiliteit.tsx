import { edition } from '../../config/edition';

interface LogoDashboardDeelmobiliteitProps {
  /** Text color of the logo. Defaults to the app's dark text color. */
  color?: string;
}

function LogoDashboardDeelmobiliteit({
  color = '#343E47'
}: LogoDashboardDeelmobiliteitProps) {
  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{
        font: 'normal normal bold 20px/24px Inter',
        color
      }}>
        Dashboard Deelmobiliteit
      </div>
      <div style={{
        marginTop: '4px',
        borderBottom: '3px solid #15AEEF'
      }} />
      <img
        src={edition.logo}
        alt={edition.logoAlt}
        style={{ display: 'block', width: '100%', height: 'auto', marginTop: '6px' }}
      />
    </div>
  )
}

export default LogoDashboardDeelmobiliteit;
