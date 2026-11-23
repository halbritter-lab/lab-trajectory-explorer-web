import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'

interface Props {
  /** What failed, as the heading names it: "The Cohort models page", "Lab Trajectory Explorer". */
  area: string
  /** Shown under the heading: what the user still has and what retrying does. */
  hint: string
  children: ReactNode
}

/**
 * Keeps a rendering error from unmounting everything above it. React removes
 * the whole tree when a component throws while rendering and no boundary
 * catches it: the page goes blank and the session is lost. The fallback keeps
 * the surrounding interface and offers to render the area again; the loaded
 * dataset lives in the store and is not affected.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.area} could not be displayed.`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <div className="card error-boundary" role="alert">
      <h2>{t('{area} could not be displayed', { area: this.props.area })}</h2>
      <p>{this.props.hint}</p>
      <p className="muted">{t('Error: {message}', { message: error.message || t('unknown error') })}</p>
      <div className="actions"><button type="button" className="primary" onClick={() => this.setState({ error: null })}>{t('Retry')}</button></div>
    </div>
  }
}
