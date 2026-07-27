// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
