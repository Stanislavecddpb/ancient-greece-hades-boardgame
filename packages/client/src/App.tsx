import { useEffect, useState } from 'react';
import { Home } from './Home';
import { GameRoom } from './GameRoom';
import { LocalGame } from './LocalGame';

function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();

  const matchMatch = hash.match(/^#\/m\/(.+)$/);
  if (matchMatch) return <GameRoom matchID={matchMatch[1]} />;
  if (hash === '#/local') return <LocalGame />;
  return <Home />;
}
