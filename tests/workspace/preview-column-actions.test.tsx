import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnActions } from '../../prototypes/trajectory-toolbar/ColumnActions'

describe('preview column grouping actions', () => {
  it('groups from the column menu without invoking sorting', () => {
    const onSort = vi.fn(), onToggle = vi.fn()
    render(<ColumnActions label="site" metrics={[{ id: 'value', label: 'Value' }]} activeMetric={null} ascending defaultAscending onSort={onSort} grouping={{ active: false, onToggle }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Column actions: site' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Group by site', checked: false }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onSort).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
