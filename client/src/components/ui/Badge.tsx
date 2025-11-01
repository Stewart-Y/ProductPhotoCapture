import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'border transparent bg-blue-600 text-white hover:bg-blue-600/80',
      secondary: 'border transparent bg-gray-200 text-gray-900 hover:bg-gray-200/80',
      destructive: 'border transparent bg-red-600 text-white hover:bg-red-600/80',
      outline: 'text-foreground',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

/**
 * Status Badge component with Flow v2 status colors
 */
interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: string;
}

export const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const statusClass = `status-${status.toLowerCase().replace(/_/g, '-')}`;

    return (
      <Badge
        ref={ref}
        className={cn('font-semibold', statusClass, className)}
        variant="default"
        {...props}
      >
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';
