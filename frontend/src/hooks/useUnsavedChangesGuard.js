import { useCallback, useEffect, useRef } from 'react'
import { Modal } from 'antd'
import { useBlocker } from 'react-router-dom'

// Warns before unsaved work is lost: an in-app confirm for links, the sidebar and the back
// button, and the browser's own prompt for refresh or closing the tab.
// Render the returned contextHolder. Call allowNavigation() right before navigating away on
// purpose (e.g. after deleting), since state updates do not reach the guard until next render.
export function useUnsavedChangesGuard(hasUnsavedChanges) {
  const guardRef = useRef(hasUnsavedChanges)
  useEffect(() => {
    guardRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => guardRef.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )
  const [modal, contextHolder] = Modal.useModal()
  // The blocker object changes on every render, so remember the dialog is already showing.
  const dialogOpenRef = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked' || dialogOpenRef.current) return
    dialogOpenRef.current = true
    const close = (action) => () => {
      dialogOpenRef.current = false
      action()
    }
    modal.confirm({
      title: 'Leave without saving?',
      content: 'Your changes on this page have not been saved. Save a draft first to keep them.',
      okText: 'Leave page',
      okButtonProps: { danger: true },
      cancelText: 'Stay',
      onOk: close(() => blocker.proceed()),
      onCancel: close(() => blocker.reset()),
    })
  }, [blocker, modal])

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  const allowNavigation = useCallback(() => {
    guardRef.current = false
  }, [])

  return { contextHolder, allowNavigation }
}
