import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { BarChart3, Briefcase, Settings, Activity } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <div className="w-64 border-r border-border bg-card hidden md:flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Pipeline
        </h2>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            className={cn(
              'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
              location.pathname === href
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted'
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <a href="/settings" className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Settings className="w-5 h-5" />
          Settings
        </a>
      </div>
    </div>
  );
};
