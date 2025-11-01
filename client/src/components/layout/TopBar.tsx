import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '../ui/Button';

export const TopBar: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
    }
    setIsDark(!isDark);
  };

  return (
    <div className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">3JMS → AI Backgrounds → Shopify</h1>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={toggleDarkMode}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};
