import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { SucursalProvider } from './context/SucursalContext'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SucursalProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SucursalProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)