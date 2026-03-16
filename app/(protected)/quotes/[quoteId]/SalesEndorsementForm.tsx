'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from '@heroicons/react/24/outline';
import SubmitButton from '@/components/SubmitButton';

type ProjectDefaults = {
  commenceOn: string;
  deposit: number;
  installment: number;
  installmentDueOn: string;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  defaults: ProjectDefaults;
  grandTotal: number;
};

function FormattedDatePicker({
  label,
  value,
  onChange,
  name,
  min,
  required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-300">
      <span>{label}</span>
      <div className="relative mt-1">
        <input
          type="date"
          name={name}
          value={value}
          onChange={onChange}
          min={min}
          required={required}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onClick={(e) => {
            // @ts-ignore - showPicker is a newer API
            if (typeof e.currentTarget.showPicker === 'function') {
              e.currentTarget.showPicker();
            }
          }}
        />
        <div className="flex h-[38px] w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-shadow peer-focus:border-indigo-500 peer-focus:ring-2 peer-focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:peer-focus:ring-indigo-900">
          <span className={value ? 'text-gray-900 dark:text-white' : 'text-gray-500'}>
            {value ? format(parseISO(value), 'd MMMM yyyy') : 'Select date'}
          </span>
          <CalendarIcon className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    </label>
  );
}

export default function SalesEndorsementForm({ action, defaults, grandTotal }: Props) {
  const [values, setValues] = useState({
    commenceOn: defaults.commenceOn,
    deposit: defaults.deposit.toString(),
    installment: defaults.installment.toString(),
    installmentDueDate: defaults.installmentDueOn,
  });

  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { commenceOn, deposit, installment, installmentDueDate } = values;

    // Client-side validation
    let validationError = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (commenceOn) {
      const commenceDate = new Date(commenceOn);
      commenceDate.setHours(0, 0, 0, 0);
      if (commenceDate <= today) {
        validationError = 'Commencement date must be in the future';
      } else if (installmentDueDate) {
        const dueDate = new Date(installmentDueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate <= commenceDate) {
          validationError = 'Installment due date must be after the commencement date';
        }
      }
    }

    setError(validationError);

    const isFilled =
      commenceOn.trim() !== '' &&
      deposit.trim() !== '' &&
      installment.trim() !== '' &&
      installmentDueDate.trim() !== '';

    setIsValid(isFilled && !validationError);
  }, [values]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <form action={action} className="mt-4 grid gap-4 md:grid-cols-2">
      <FormattedDatePicker
        label="Commencement date"
        name="commenceOn"
        value={values.commenceOn}
        onChange={handleChange}
        required
        min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
      />

      <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-300">
        <span>Deposit (major)</span>
        <input
          type="number"
          name="deposit"
          value={values.deposit}
          onChange={handleChange}
          onFocus={(e) => e.target.select()}
          step="0.01"
          min="0"
          max={grandTotal}
          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:focus:ring-indigo-900 transition-shadow"
        />
      </label>

      <label className="flex flex-col text-sm font-medium text-gray-700 dark:text-gray-300">
        <span>Installment (major)</span>
        <input
          type="number"
          name="installment"
          value={values.installment}
          onChange={handleChange}
          onFocus={(e) => e.target.select()}
          step="0.01"
          min="0"
          max={grandTotal}
          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:focus:ring-indigo-900 transition-shadow"
        />
      </label>

      <FormattedDatePicker
        label="Installment Due Date"
        name="installmentDueDate"
        value={values.installmentDueDate}
        onChange={handleChange}
        required
        min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
      />

      <div className="md:col-span-2 flex justify-center mt-4 flex-col items-center">
        {error && (
          <div className="mb-4 w-full rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}
        <SubmitButton
          className={`rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all w-full ${
            isValid
              ? 'bg-green-600 hover:bg-green-700 hover:shadow-lg hover:-translate-y-0.5'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
          loadingText="Saving..."
          disabled={!isValid}
        >
          Endorse & Create Project
        </SubmitButton>
      </div>
    </form>
  );
}
