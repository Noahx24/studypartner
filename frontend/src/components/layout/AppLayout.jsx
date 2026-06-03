import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, CalendarDays, ClipboardList, UserCircle, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Today' },
  { path: '/modules', icon: BookOpen, label: 'Modules' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/plan', icon: ClipboardList, label: 'Plan' },
  { path: '/profile', icon: UserCircle, label: 'Profile' },
];

export default function AppLayout() {
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('sp_theme') === 'dark' ||
      (!localStorage.getItem('sp_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sp_theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header. paddingTop accommodates the iOS status bar / notch
          via the safe-area-inset env var; falls back to 0 on devices
          without safe-area cutouts. */}
      <header
        className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/60"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">StudyPartner</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark(d => !d)}
            className="h-9 w-9 rounded-xl"
          >
            {dark
              ? <Sun className="w-4 h-4 text-accent" />
              : <Moon className="w-4 h-4 text-muted-foreground" />
            }
          </Button>
        </div>
      </header>

      {/* Content. Extra bottom padding so the home-indicator on
          notched iPhones doesn't sit under the floating nav. */}
      <main
        className="flex-1 max-w-2xl mx-auto w-full px-4 pt-6"
        style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>

      {/* Bottom Navigation. paddingBottom = home-indicator avoidance. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 transition-all", isActive && "stroke-[2.5]")} />
                  <span className={cn("text-[10px] font-medium tracking-wide", isActive && "font-semibold")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}