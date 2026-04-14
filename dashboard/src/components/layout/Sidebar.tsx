import { NavLink } from 'react-router-dom';

interface NavSection {
  title: string;
  color?: string;
  items: { to: string; label: string; icon: string }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Accounts Payable',
    color: 'text-blue-400',
    items: [
      { to: '/', label: 'Overview', icon: '□' },
      { to: '/vendors', label: 'Vendors', icon: '◇' },
      { to: '/buildings', label: 'Buildings', icon: '△' },
    ],
  },
  {
    title: 'Credit Cards',
    color: 'text-purple-400',
    items: [
      { to: '/credit-cards', label: 'Card Transactions', icon: '○' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { to: '/timeline', label: 'Timeline', icon: '━' },
      { to: '/search', label: 'Search', icon: '◎' },
    ],
  },
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
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p
              className={`text-[10px] font-semibold uppercase tracking-wider px-3 mb-1.5 ${
                section.color || 'text-muted-foreground'
              }`}
            >
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
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
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground leading-tight">
          Iowa City Community School District
          <br />
          AP &amp; Credit Card Data
        </p>
      </div>
    </aside>
  );
}
