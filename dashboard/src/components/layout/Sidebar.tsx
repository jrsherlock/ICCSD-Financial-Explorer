import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: '□' },
  { to: '/vendors', label: 'Vendors', icon: '◇' },
  { to: '/buildings', label: 'Buildings', icon: '△' },
  { to: '/credit-cards', label: 'Credit Cards', icon: '○' },
  { to: '/timeline', label: 'Timeline', icon: '━' },
  { to: '/search', label: 'Search', icon: '◎' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-card border-r border-border flex flex-col z-40">
      <div className="p-5 border-b border-border">
        <h1 className="text-base font-bold tracking-tight text-foreground">
          ICCSD Financial
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Explorer</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`
            }
          >
            <span className="text-xs opacity-60">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground leading-tight">
          Iowa City Community School District
          <br />
          Accounts Payable Data
        </p>
      </div>
    </aside>
  );
}
