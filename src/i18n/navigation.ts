import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** استخدم هذه بدل next/link و next/navigation حتى تُحفظ اللغة في كل تنقّل. */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
