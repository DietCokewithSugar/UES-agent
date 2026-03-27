import React from 'react';
import { ChecklistStatus } from '../../types';

interface ChecklistStatusBadgeProps {
  status: ChecklistStatus;
  onClick?: () => void;
}

const STATUS_STYLE: Record<ChecklistStatus, string> = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  fail: 'border-rose-200 bg-rose-50 text-rose-700'
};

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  pass: '通过',
  fail: '不通过'
};

export const ChecklistStatusBadge: React.FC<ChecklistStatusBadgeProps> = ({ status, onClick }) => {
  const className = `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:opacity-85`}>
        {STATUS_LABEL[status]}
      </button>
    );
  }

  return <span className={className}>{STATUS_LABEL[status]}</span>;
};
