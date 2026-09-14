import { Home, ListChecks, Megaphone, Star, Calculator, Wallet, BarChart3, Target, Bell, FlaskConical, Users, Settings, type LucideIcon } from 'lucide-react';

export const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/orders', label: 'Ordens', icon: ListChecks },
  { href: '/ads', label: 'Anúncios', icon: Megaphone },
  { href: '/watchlist', label: 'Favoritos', icon: Star },
  { href: '/simulation', label: 'Simulação', icon: Calculator },
  { href: '/wallet', label: 'Carteira', icon: Wallet },
  { href: '/analytics', label: 'Análise', icon: BarChart3 },
  { href: '/opportunities', label: 'Oportunidades', icon: Target },
  { href: '/alerts', label: 'Alertas', icon: Bell },
  { href: '/research', label: 'Research Lab', icon: FlaskConical },
  { href: '/customers', label: 'Contrapartes', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
];
