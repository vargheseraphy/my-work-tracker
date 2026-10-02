/** The team list, the way into each person's detail page. */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Profile } from '@gtm/shared';
import { api } from '../../api.js';
import { DataTable, type Column } from '../../components/data.jsx';
import { Card, Empty, Loading, PageHead, Pill } from '../../components/ui.jsx';

export function People() {
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ people: Profile[] }>('/people'),
  });

  if (isPending) return <Loading what="Loading the team" />;
  if (!data) return <Empty>The team could not be loaded.</Empty>;

  const columns: Column<Profile>[] = [
    { key: 'name', head: 'Name', render: (p) => <b className="small">{p.fullName}</b> },
    { key: 'email', head: 'Email', render: (p) => <span className="small muted">{p.email}</span> },
    { key: 'role', head: 'Role', render: (p) => <Pill>{p.role}</Pill> },
    { key: 'tz', head: 'Time zone', render: (p) => <span className="mono xs">{p.timezone}</span> },
    {
      key: 'active',
      head: 'Status',
      render: (p) => <Pill tone={p.active ? 'good' : 'bad'}>{p.active ? 'Active' : 'Inactive'}</Pill>,
    },
  ];

  return (
    <>
      <PageHead eyebrow="Team" title="People" />
      <Card as="section">
        <DataTable
          caption="The team"
          columns={columns}
          rows={data.people}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/people/${p.id}`)}
        />
      </Card>
    </>
  );
}
