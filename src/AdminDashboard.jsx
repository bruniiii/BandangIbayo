import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Map, Calendar, Users,
  FileText, Bell, CreditCard, LogOut, Search, TrendingUp, AlertCircle,
  CheckCircle2, XCircle, Clock, Compass
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import TourManagement from './TourManagement';
import BookingManagement from './BookingManagement';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 
// ─── Helpers ────────────────────────────────────────────────────────────────
 
const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
};
 
const deriveActivity = (booking) => {
  const name = booking.profiles
    ? `${booking.profiles.first_name || ''} ${booking.profiles.last_name || ''}`.trim()
    : booking.full_name || 'Unknown';
 
  if (booking.booking_status === 'Cancelled') {
    return { label: 'Booking cancelled', name, type: 'cancel', Icon: XCircle, ts: booking.updated_at || booking.created_at };
  }
  if (booking.payment_status === 'Complete' || booking.payment_status === 'Verified') {
    return { label: 'Payment confirmed via GCash', name, type: 'payment', Icon: CreditCard, ts: booking.updated_at || booking.created_at };
  }
  return { label: 'New booking created', name, type: 'booking', Icon: CheckCircle2, ts: booking.created_at };
};
 
const NAV_ITEMS = [
  { icon: <LayoutDashboard size={18} strokeWidth={2} />, label: 'Overview' },
  { icon: <Map size={18} strokeWidth={2} />,             label: 'Tour Management' },
  { icon: <Calendar size={18} strokeWidth={2} />,        label: 'Booking Management' },
  { icon: <FileText size={18} strokeWidth={2} />,        label: 'Reports' },
  { icon: <Bell size={18} strokeWidth={2} />,            label: 'Reviews' },
];
 
// ─── Main Component ──────────────────────────────────────────────────────────
 
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('Overview');
  const navigate = useNavigate();
 
  const [stats, setStats] = useState({
    totalBookings: '—',
    bookingsThisMonth: '—',
    pendingVerification: '—',
    totalJoiners: '—',
    bookingsLastMonth: 0,
    toursNextMonth: 0,
    joinersThisWeek: 0,
  });
  const [activities, setActivities] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
 
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) alert('Logout failed: ' + error.message);
    else navigate('/admin/login');
  };
 
  const fetchOverviewData = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const nextMonthStart = monthEnd;
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
 
    const [
      { count: totalBookings },
      { count: bookingsThisMonth },
      { count: bookingsLastMonth },
      { count: toursNextMonth },
      { count: pendingVerification },
      { count: totalJoiners },
      { count: joinersThisWeek },
      { data: recentBookingsRaw },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('tour_date', monthStart).lt('tour_date', monthEnd),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('tour_date', lastMonthStart).lt('tour_date', monthStart),
      supabase.from('tours').select('*', { count: 'exact', head: true }).gte('start_date', nextMonthStart).lt('start_date', nextMonthEnd).eq('is_archived', false),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('payment_status', ['Pending', 'Verification Pending']),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('bookings').select('id, full_name, user_id, payment_status, booking_status, created_at, updated_at').order('updated_at', { ascending: false }).limit(10),
    ]);
 
    setStats({
      totalBookings: totalBookings?.toLocaleString() ?? '—',
      bookingsThisMonth: bookingsThisMonth?.toLocaleString() ?? '—',
      pendingVerification: pendingVerification?.toLocaleString() ?? '—',
      totalJoiners: totalJoiners?.toLocaleString() ?? '—',
      bookingsLastMonth: bookingsLastMonth ?? 0,
      toursNextMonth: toursNextMonth ?? 0,
      joinersThisWeek: joinersThisWeek ?? 0,
    });
 
    if (recentBookingsRaw && recentBookingsRaw.length > 0) {
      const userIds = [...new Set(recentBookingsRaw.map(b => b.user_id).filter(Boolean))];
      const { data: profilesData } = await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds);
      const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));
      const enriched = recentBookingsRaw.map(b => ({ ...b, profiles: profileMap[b.user_id] || null }));
      setActivities(enriched.map(deriveActivity));
    } else {
      setActivities([]);
    }
  };
 
  useEffect(() => {
    if (activeTab !== 'Overview') return;
    (async () => {
      setLoadingStats(true);
      await fetchOverviewData();
      setLoadingStats(false);
    })();
  }, [activeTab]);
 
  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
 
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 268,
        flexShrink: 0,
        background: '#1A0A00',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        boxShadow: '4px 0 32px rgba(26,10,0,0.28)',
      }}>
        {/* brand */}
        <div style={{
          padding: '2rem 1.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <polygon points="16,4 30,28 2,28" fill="#C45C26" opacity="0.9"/>
              <polygon points="16,10 26,28 6,28" fill="#FDF6EE" opacity="0.25"/>
            </svg>
            <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', color: '#FDF6EE' }}>
              Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
            </span>
          </div>
          <p style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0,
          }}>
            Admin Management
          </p>
        </div>
 
        {/* nav */}
        <nav style={{ flex: 1, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ icon, label }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              onClick={() => setActiveTab(label)}
            />
          ))}
        </nav>
 
        {/* sign out */}
        <div style={{ padding: '1.5rem 1.75rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(232,210,190,0.4)',
              fontFamily: 'inherit',
              padding: 0,
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#E8A265'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,210,190,0.4)'}
          >
            <LogOut size={16} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Logout System
            </span>
          </button>
        </div>
      </aside>
 
      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
 
        {/* header */}
        <header style={{
          background: '#FDF6EE',
          borderBottom: '1px solid rgba(196,92,38,0.12)',
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 2.5rem',
          position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 2px 16px rgba(26,10,0,0.06)',
        }}>
          <h2 style={{
            fontWeight: 900, fontSize: 15, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#1A0A00', margin: 0,
          }}>
            {activeTab}
          </h2>
 
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* search */}
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute', left: 14, top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(122,58,24,0.35)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search system..."
                style={{
                  paddingLeft: 36, paddingRight: 16,
                  paddingTop: 9, paddingBottom: 9,
                  background: '#F2E4D0',
                  border: '1px solid rgba(196,92,38,0.18)',
                  borderRadius: 999,
                  fontSize: 11, fontWeight: 600,
                  color: '#1A0A00',
                  fontFamily: 'inherit',
                  width: 220,
                  outline: 'none',
                }}
              />
            </div>
 
            {/* admin chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#F2E4D0',
              border: '1px solid rgba(196,92,38,0.18)',
              borderRadius: 14, padding: '8px 14px',
            }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A0A00', margin: 0, lineHeight: 1 }}>Administrator</p>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#7A3A18', opacity: 0.65, margin: '3px 0 0', lineHeight: 1 }}>Bandang IBAYO</p>
              </div>
              <div style={{
                width: 38, height: 38, borderRadius: 11,
                background: '#1A0A00',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#E8A265', fontWeight: 900, fontSize: 15,
                boxShadow: '0 4px 12px rgba(26,10,0,0.22)',
                flexShrink: 0,
              }}>
                A
              </div>
            </div>
          </div>
        </header>
 
        {/* content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#F2E4D0' }}>
 
          {activeTab === 'Overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
 
              {/* hero banner */}
              <div style={{
                position: 'relative',
                background: '#1A0A00',
                borderRadius: 28,
                padding: '3rem 3.5rem',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(26,10,0,0.28)',
                borderBottom: '6px solid #C45C26',
              }}>
                {/* warm glow */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: '40%', height: '100%',
                  background: 'radial-gradient(ellipse at top right, rgba(196,92,38,0.18) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }} />
                {/* compass watermark */}
                <Compass
                  size={240}
                  style={{
                    position: 'absolute', right: -30, bottom: -30,
                    color: 'rgba(255,255,255,0.04)',
                    transform: 'rotate(12deg)',
                  }}
                />
 
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: '#C45C26',
                    borderRadius: 999, padding: '5px 16px',
                    marginBottom: 16,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDF6EE' }}>
                      Admin Control Panel
                    </span>
                  </div>
 
                  <h2 style={{
                    fontWeight: 900, fontSize: 'clamp(1.6rem, 2.5vw, 2.4rem)',
                    letterSpacing: '-0.03em', lineHeight: 1.1,
                    color: '#FDF6EE', margin: '0 0 14px',
                  }}>
                    Welcome back,{' '}
                    <span style={{ color: '#E8A265' }}>Administrator</span>
                  </h2>
 
                  <p style={{
                    fontSize: 14, lineHeight: 1.75, fontWeight: 500,
                    color: 'rgba(232,210,190,0.7)', margin: 0, maxWidth: 540,
                  }}>
                    Manage tours, verify bookings, and monitor joiner activity across
                    the Bandang IBAYO platform — all from one place.
                  </p>
                </div>
              </div>
 
              {/* stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 }}>
                <StatCard
                  title="Total Bookings"
                  value={loadingStats ? '…' : stats.totalBookings}
                  icon={<TrendingUp size={18} />}
                  iconColor="#C45C26"
                  trend={loadingStats ? '' : (() => {
                    const curr = parseInt(stats.bookingsThisMonth.replace(/,/g, '')) || 0;
                    const last = stats.bookingsLastMonth || 0;
                    const change = last === 0 ? 0 : Math.round(((curr - last) / last) * 100);
                    return `${change >= 0 ? '+' : ''}${change}% vs last month`;
                  })()}
                />
                <StatCard
                  title="Bookings This Month"
                  value={loadingStats ? '…' : stats.bookingsThisMonth}
                  icon={<Calendar size={18} />}
                  iconColor="#7A3A18"
                  trend={loadingStats ? '' : `${stats.toursNextMonth} tours next month`}
                />
                <StatCard
                  title="Pending Verification"
                  value={loadingStats ? '…' : stats.pendingVerification}
                  icon={<AlertCircle size={18} />}
                  iconColor="#C45C26"
                  trend={loadingStats ? '' : 'Awaiting payment review'}
                />
                <StatCard
                  title="Total Joiners"
                  value={loadingStats ? '…' : stats.totalJoiners}
                  icon={<Users size={18} />}
                  iconColor="#7A3A18"
                  trend={loadingStats ? '' : `${stats.joinersThisWeek} new this week`}
                />
              </div>
 
              {/* recent activity */}
              <div style={{
                background: '#FDF6EE',
                borderRadius: 24,
                padding: '2rem 2.5rem',
                border: '1px solid rgba(196,92,38,0.12)',
                boxShadow: '0 4px 24px rgba(26,10,0,0.06)',
              }}>
                <h3 style={{
                  fontWeight: 900, fontSize: 13, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#1A0A00',
                  margin: '0 0 24px',
                }}>
                  Recent System Activity
                </h3>
 
                {loadingStats ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4rem 0', color: 'rgba(122,58,24,0.3)',
                  }}>
                    <Clock size={22} style={{ marginRight: 10 }} />
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                      Loading activity…
                    </span>
                  </div>
                ) : activities.length === 0 ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '4rem 0',
                    border: '2px dashed rgba(196,92,38,0.15)',
                    borderRadius: 16,
                    color: 'rgba(122,58,24,0.3)',
                  }}>
                    <Users size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
                      No recent activity
                    </p>
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {activities.map((item, i) => (
                      <ActivityItem key={i} {...item} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
 
          {activeTab === 'Tour Management' && <TourManagement />}
          {activeTab === 'Booking Management' && <BookingManagement />}
 
          {activeTab !== 'Overview' && activeTab !== 'Tour Management' && activeTab !== 'Booking Management' && (
            <div style={{
              height: '100%', minHeight: 400,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: '#FDF6EE',
              borderRadius: 24,
              border: '1px solid rgba(196,92,38,0.12)',
              boxShadow: '0 4px 24px rgba(26,10,0,0.06)',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: '#F2E4D0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(196,92,38,0.25)', marginBottom: 20,
              }}>
                <FileText size={36} />
              </div>
              <h3 style={{
                fontWeight: 900, fontSize: 14, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 8px',
              }}>
                {activeTab} Module
              </h3>
              <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.6, margin: 0 }}>
                Coming soon — check back later.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
 
// ─── Activity Item ────────────────────────────────────────────────────────────
 
const ACTIVITY_COLORS = {
  cancel:  { bg: 'rgba(196,92,38,0.10)',  color: '#C45C26' },
  payment: { bg: 'rgba(26,10,0,0.07)',    color: '#7A3A18' },
  booking: { bg: 'rgba(232,162,101,0.15)', color: '#E8A265' },
};
 
const ActivityItem = ({ label, name, type, ts }) => {
  const { bg, color } = ACTIVITY_COLORS[type] || ACTIVITY_COLORS.booking;
  return (
    <li style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid rgba(196,92,38,0.08)',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color,
        }}>
          <Icon size={17} />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1A0A00', margin: 0 }}>{label}</p>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.65, margin: '3px 0 0' }}>{name}</p>
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color: '#7A3A18',
        opacity: 0.5, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {timeAgo(ts)}
      </span>
    </li>
  );
};
 
// ─── Nav Item ────────────────────────────────────────────────────────────────
 
const NavItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      borderRadius: 12,
      border: 'none', cursor: 'pointer',
      fontFamily: 'inherit',
      background: active ? '#C45C26' : 'transparent',
      color: active ? '#FDF6EE' : 'rgba(232,210,190,0.45)',
      fontWeight: active ? 900 : 600,
      transform: active ? 'translateX(4px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(196,92,38,0.35)' : 'none',
      transition: 'all 0.2s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.5)', flexShrink: 0 }}>
      {icon}
    </span>
    <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
      {label}
    </span>
  </button>
);
 
// ─── Stat Card ───────────────────────────────────────────────────────────────
 
const StatCard = ({ title, value, icon, iconColor, trend }) => (
  <div style={{
    background: '#FDF6EE',
    borderRadius: 20,
    padding: '1.75rem 2rem',
    border: '1px solid rgba(196,92,38,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'transform 0.2s',
    cursor: 'default',
  }}
    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: 0,
      }}>
        {title}
      </p>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: '#F2E4D0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor || '#C45C26',
        flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
    <p style={{
      fontSize: 38, fontWeight: 900, letterSpacing: '-0.04em',
      color: '#1A0A00', margin: 0, lineHeight: 1,
    }}>
      {value}
    </p>
    {trend && (
      <p style={{
        fontSize: 10, fontWeight: 700, fontStyle: 'italic',
        color: '#7A3A18', opacity: 0.55, margin: 0,
      }}>
        {trend}
      </p>
    )}
  </div>
);
 
export default AdminDashboard;
 