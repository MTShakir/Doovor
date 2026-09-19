import { describe, expect, it } from 'vitest';
import { unreadBadge, unreadLabel } from './notification-bell';

describe('the notification bell (NTF-01, D-159)', () => {
  it('shows no badge until something is waiting', () => {
    expect(unreadBadge(null)).toBeNull();
    expect(unreadBadge(0)).toBeNull();
  });

  it('counts up to nine, then says there are more than fit', () => {
    expect(unreadBadge(1)).toBe('1');
    expect(unreadBadge(9)).toBe('9');
    expect(unreadBadge(10)).toBe('9+');
    expect(unreadBadge(240)).toBe('9+');
  });

  it('tells a screen reader the exact number, which the badge rounds', () => {
    expect(unreadLabel(null)).toBe('Notifications');
    expect(unreadLabel(0)).toBe('Notifications');
    expect(unreadLabel(1)).toBe('Notifications, 1 unread');
    expect(unreadLabel(240)).toBe('Notifications, 240 unread');
  });
});
