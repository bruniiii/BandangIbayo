import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import Toaster from './ui/Toaster';
import { installInputFilter } from './ui/inputFilter';
import './index.css';
import './App.css';

// Name fields refuse numbers, number fields refuse letters (see ui/inputFilter).
installInputFilter();
 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
      <Toaster />
    </Router>
  </React.StrictMode>
);