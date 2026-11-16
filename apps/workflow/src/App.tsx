import '@openchart/core/styles.css';

import Home from './pages/Home';
import './styles.css';

const App = () => {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Home />
    </main>
  );
};

export default App;
