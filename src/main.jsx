import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import "./App.css";

document.documentElement.style.background = '#000'
document.body.style.background = '#000'
document.body.style.margin = '0'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
