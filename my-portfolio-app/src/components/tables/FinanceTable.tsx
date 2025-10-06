import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  ColumnPinningState
} from '@tanstack/react-table';
import { Card, Table, Group, Button, TextInput, Text } from '@mantine/core';
import { ELEVATION, MOTION } from '../../theme/designSystem';

export interface FinanceTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  title?: string;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enablePagination?: boolean;
  enableColumnPinning?: boolean;
  enableCSVExport?: boolean;
  pageSize?: number;
}

function FinanceTable<TData>({
  data,
  columns,
  title = 'Financial Data',
  enableSorting = true,
  enableFiltering = true,
  enablePagination = true,
  enableColumnPinning = false,
  enableCSVExport = true,
  pageSize = 25
}: FinanceTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnPinning,
      globalFilter
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    initialState: {
      pagination: {
        pageSize
      }
    }
  });

  const exportToCSV = () => {
    const headers = columns.map(col => (col as any).header || (col as any).accessorKey || '');
    const rows = table.getPrePaginationRowModel().rows.map(row => 
      row.getVisibleCells().map(cell => cell.getValue())
    );
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card 
      withBorder
      style={{
        ...ELEVATION[1],
        transition: `all ${MOTION.duration}ms ${MOTION.easing}`
      }}
    >
      <Card.Section p="md" withBorder>
        <Group justify="space-between" align="center">
          <Text size="lg" fw={600} style={{ fontFamily: 'Inter, sans-serif' }}>
            {title}
          </Text>
          <Group gap="sm">
            {enableFiltering && (
              <TextInput
                placeholder="Search all columns..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                size="sm"
                w={200}
              />
            )}
            {enableCSVExport && (
              <Button size="sm" variant="light" onClick={exportToCSV}>
                Export CSV
              </Button>
            )}
          </Group>
        </Group>
      </Card.Section>

      <Table.ScrollContainer minWidth={800}>
        <Table 
          striped 
          highlightOnHover
          style={{
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <Table.Thead>
            {table.getHeaderGroups().map(headerGroup => (
              <Table.Tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <Table.Th 
                    key={header.id}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      color: 'var(--mantine-color-gray-6)'
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <Group gap={4} wrap="nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map(row => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <Table.Td 
                    key={cell.id}
                    style={{
                      fontSize: '0.875rem',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {enablePagination && (
        <Card.Section p="md" withBorder>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getPrePaginationRowModel().rows.length
              )}{' '}
              of {table.getPrePaginationRowModel().rows.length} entries
            </Text>
            <Group gap="sm">
              <Button
                size="sm"
                variant="subtle"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Text size="sm" style={{ minWidth: '4rem', textAlign: 'center' }}>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </Text>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </Group>
          </Group>
        </Card.Section>
      )}
    </Card>
  );
}

export default FinanceTable;