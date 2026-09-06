import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search, Bike, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import CustomerSearchPOS from '../components/CustomerSearchPOS';
import CustomerFormPOS from '../components/CustomerFormPOS';
import ReservationReview from '../components/ReservationReview';
import {
  pos,
  reservations,
  motorcycles,
  type CustomerSearchResult,
  type MotorcycleSearchResult,
} from '../api';
import { POSTransactionType, type CreatePOSTransactionDto } from '../../../packages/shared-types/src/pos';
import { useViewingBranch } from '../contexts/ViewingBranchContext';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Create Reservation',
    step1: 'Select Customer',
    step2: 'Select Motorcycle',
    step3: 'Enter Deposit',
    step4: 'Review & Confirm',
    customerSelected: 'Customer Selected',
    motorcycleSelected: 'Motorcycle Selected',
    change: 'Change',
    searchCustomer: 'Search Customer',
    createNewCustomer: 'Create New Customer',
    searchMotorcycles: 'Search motorcycles by VIN or model...',
    availableMotorcycles: 'Available Motorcycles',
    select: 'Select',
    noMotorcycles: 'No available motorcycles found',
    searching: 'Searching...',
    depositAmount: 'Deposit Amount',
    enterDeposit: 'Enter deposit amount (EGP)...',
    minimumDeposit: 'Minimum deposit',
    maximumDeposit: 'Maximum deposit',
    invalidDeposit: 'Invalid deposit amount',
    depositRequired: 'Deposit amount is required',
    depositTooLow: 'Deposit must be at least',
    depositTooHigh: 'Deposit cannot exceed motorcycle price',
    continue: 'Continue',
    back: 'Back',
    vin: 'VIN',
    model: 'Model',
    year: 'Year',
    price: 'Price',
    branch: 'Branch',
    reservationCreated: 'Reservation created successfully!',
    errorCreating: 'Failed to create reservation',
    viewReservation: 'View Reservation',
    createAnother: 'Create Another',
  },
  ar: {
    title: 'إنشاء حجز',
    step1: 'اختيار العميل',
    step2: 'اختيار الدراجة',
    step3: 'إدخال العربون',
    step4: 'المراجعة والتأكيد',
    customerSelected: 'تم اختيار العميل',
    motorcycleSelected: 'تم اختيار الدراجة',
    change: 'تغيير',
    searchCustomer: 'البحث عن عميل',
    createNewCustomer: 'إنشاء عميل جديد',
    searchMotorcycles: 'ابحث عن الدراجات بواسطة رقم الهيكل أو الموديل...',
    availableMotorcycles: 'الدراجات المتاحة',
    select: 'اختيار',
    noMotorcycles: 'لا توجد دراجات متاحة',
    searching: 'جاري البحث...',
    depositAmount: 'مبلغ العربون',
    enterDeposit: 'أدخل مبلغ العربون (ريال سعودي)...',
    minimumDeposit: 'الحد الأدنى للعربون',
    maximumDeposit: 'الحد الأقصى للعربون',
    invalidDeposit: 'مبلغ العربون غير صحيح',
    depositRequired: 'مبلغ العربون مطلوب',
    depositTooLow: 'يجب أن يكون العربون على الأقل',
    depositTooHigh: 'لا يمكن أن يتجاوز العربون سعر الدراجة',
    continue: 'متابعة',
    back: 'رجوع',
    vin: 'رقم الهيكل',
    model: 'الموديل',
    year: 'السنة',
    price: 'السعر',
    branch: 'الفرع',
    reservationCreated: 'تم إنشاء الحجز بنجاح!',
    errorCreating: 'فشل إنشاء الحجز',
    viewReservation: 'عرض الحجز',
    createAnother: 'إنشاء حجز آخر',
  },
};

interface Props {
  lang: Lang;
}

export default function CreateReservation({ lang }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { viewingBranchId, isSuperAdmin } = useViewingBranch();
  const branchId = isSuperAdmin ? viewingBranchId ?? undefined : undefined;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<'customer' | 'motorcycle' | 'deposit' | 'review'>('customer');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [selectedMotorcycle, setSelectedMotorcycle] = useState<MotorcycleSearchResult | null>(null);
  const [motorcycleSearch, setMotorcycleSearch] = useState('');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositError, setDepositError] = useState<string>('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [createdReservation, setCreatedReservation] = useState<{
    id: string;
    reservationNumber: string;
  } | null>(null);

  // Minimum deposit: 10% or 1000 EGP
  const getMinimumDeposit = () => {
    if (!selectedMotorcycle) return 0;
    return Math.max(selectedMotorcycle.price * 0.1, 1000);
  };

  // Search available motorcycles
  const { data: motorcyclesData, isLoading: motorcyclesLoading } = useQuery({
    queryKey: ['motorcycles', motorcycleSearch, branchId],
    queryFn: () =>
      motorcycles.search({
        search: motorcycleSearch,
        branchId,
        status: 'available',
        limit: 50,
      }),
    enabled: step === 'motorcycle',
  });

  const availableMotorcycles = motorcyclesData?.items ?? [];

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const data: CreatePOSTransactionDto = {
        type: POSTransactionType.RESERVATION,
        customerId: selectedCustomer!.id,
        motorcycleId: selectedMotorcycle!.id,
        reservationData: { depositAmount: parseFloat(depositAmount), expirationDays: 7 },
        address: address || undefined,
        idempotencyKey: idempotencyKey || `pos-${crypto.randomUUID()}`,
        notes: notes || undefined,
      };
      if (!idempotencyKey) setIdempotencyKey(data.idempotencyKey);
      const validation = await pos.validateTransaction({
        customerId: data.customerId,
        motorcycleId: data.motorcycleId,
        type: data.type,
        depositAmount: data.reservationData?.depositAmount,
      });
      if (!validation.valid) throw new Error(validation.warnings.join(', ') || t.errorCreating);
      return pos.createTransaction(data);
    },
    onSuccess: (reservation) => {
      queryClient.invalidateQueries({ queryKey: ['desktop-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['motorcycles'] });
      setCreatedReservation({ id: reservation.id, reservationNumber: reservation.number });
    },
  });

  const handleCustomerSelect = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setAddress(customer.defaultAddress ? `${customer.defaultAddress.addressLine}${customer.defaultAddress.city ? `, ${customer.defaultAddress.city}` : ''}` : '');
    setShowCustomerSearch(false);
    setStep('motorcycle');
  };

  const handleCustomerCreated = (customer: any) => {
    setSelectedCustomer({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      nationalId: customer.nationalId,
      defaultAddress: customer.addresses?.find((a: any) => a.isDefault) ?? null,
    });
    setAddress(customer.addresses?.find((a: any) => a.isDefault)?.addressLine ?? '');
    setShowCustomerForm(false);
    setStep('motorcycle');
  };

  const handleMotorcycleSelect = (motorcycle: MotorcycleSearchResult) => {
    setSelectedMotorcycle(motorcycle);
    setStep('deposit');
  };

  const handleDepositContinue = () => {
    const amount = parseFloat(depositAmount);
    const minDeposit = getMinimumDeposit();

    if (!depositAmount || isNaN(amount) || amount <= 0) {
      setDepositError(t.depositRequired);
      return;
    }

    if (amount < minDeposit) {
      setDepositError(`${t.depositTooLow} ${formatCurrency(minDeposit)}`);
      return;
    }

    if (amount > selectedMotorcycle!.price) {
      setDepositError(t.depositTooHigh);
      return;
    }

    setDepositError('');
    setStep('review');
  };

  const handleReset = () => {
    setStep('customer');
    setSelectedCustomer(null);
    setSelectedMotorcycle(null);
    setMotorcycleSearch('');
    setDepositAmount('');
    setDepositError('');
    setAddress('');
    setNotes('');
    setIdempotencyKey('');
    setCreatedReservation(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Success screen
  if (createdReservation) {
    return (
      <div className="pos-detail-panel" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
        <div
          style={{
            maxWidth: 500,
            margin: '0 auto',
            textAlign: 'center',
            paddingTop: '4rem',
          }}
        >
          <CheckCircle size={64} style={{ color: 'var(--green-light)', marginBottom: '1.5rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{t.reservationCreated}</h1>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '1.125rem',
              color: 'var(--blue-light)',
              marginBottom: '2rem',
            }}
          >
            {createdReservation.reservationNumber}
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/reservations/${createdReservation.id}`)}
              className="btn btn-primary"
            >
              {t.viewReservation}
            </button>
            <button onClick={handleReset} className="btn btn-ghost">
              {t.createAnother}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Review step
  if (step === 'review' && selectedCustomer && selectedMotorcycle) {
    return (
      <ReservationReview
        lang={lang}
        customer={selectedCustomer}
        motorcycle={selectedMotorcycle}
        depositAmount={parseFloat(depositAmount)}
        notes={notes}
        address={address}
        onAddressChange={setAddress}
        onNotesChange={setNotes}
        onCancel={() => setStep('deposit')}
        onConfirm={() => createReservationMutation.mutate()}
        isSubmitting={createReservationMutation.isPending}
      />
    );
  }

  return (
    <div className="pos-detail-panel" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>{t.title}</h1>

        {/* Step: Customer Selection */}
        {step === 'customer' && (
          <div>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{t.step1}</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setShowCustomerSearch(true)}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                <Search size={18} />
                {t.searchCustomer}
              </button>
              <button
                onClick={() => setShowCustomerForm(true)}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                <UserPlus size={18} />
                {t.createNewCustomer}
              </button>
            </div>

            {showCustomerSearch && (
              <CustomerSearchPOS
                lang={lang}
                onSelect={handleCustomerSelect}
                onCreateNew={() => {
                  setShowCustomerSearch(false);
                  setShowCustomerForm(true);
                }}
                onClose={() => setShowCustomerSearch(false)}
              />
            )}

            {showCustomerForm && (
              <CustomerFormPOS
                lang={lang}
                onSuccess={handleCustomerCreated}
                onClose={() => setShowCustomerForm(false)}
              />
            )}
          </div>
        )}

        {/* Step: Motorcycle Selection */}
        {step === 'motorcycle' && selectedCustomer && (
          <div>
            {/* Customer summary */}
            <div className="pos-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.customerSelected}
                  </div>
                  <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', fontFamily: 'monospace' }}>
                    {selectedCustomer.phone}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setStep('customer');
                    setSelectedCustomer(null);
                  }}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.875rem' }}
                >
                  {t.change}
                </button>
              </div>
            </div>

            <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{t.step2}</h2>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  top: '50%',
                  [isRtl ? 'right' : 'left']: '1rem',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-3)',
                }}
              />
              <input
                type="text"
                value={motorcycleSearch}
                onChange={(e) => setMotorcycleSearch(e.target.value)}
                placeholder={t.searchMotorcycles}
                className="pos-input"
                style={{ [isRtl ? 'paddingRight' : 'paddingLeft']: '3rem' }}
              />
            </div>

            {/* Available motorcycles */}
            <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem' }}>{t.availableMotorcycles}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {motorcyclesLoading && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                  {t.searching}
                </div>
              )}
              {!motorcyclesLoading && availableMotorcycles.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: 'var(--text-2)',
                  }}
                >
                  <Bike size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                  <div>{t.noMotorcycles}</div>
                </div>
              )}
              {availableMotorcycles.map((motorcycle) => (
                <div key={motorcycle.id} className="pos-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {lang === 'ar' ? motorcycle.brand.nameAr : motorcycle.brand.nameEn} {motorcycle.model}
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-2)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {t.vin}: <span style={{ fontFamily: 'monospace' }}>{motorcycle.vin}</span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>
                        {t.year}: {motorcycle.year}
                        {motorcycle.color && ` • ${motorcycle.color}`}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--blue-light)', marginTop: '0.5rem' }}>
                        {formatCurrency(motorcycle.price)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleMotorcycleSelect(motorcycle)}
                      className="btn btn-primary"
                      style={{ fontSize: '0.875rem' }}
                    >
                      {t.select}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step: Deposit Amount */}
        {step === 'deposit' && selectedCustomer && selectedMotorcycle && (
          <div>
            {/* Motorcycle summary */}
            <div className="pos-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                    {t.motorcycleSelected}
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {lang === 'ar' ? selectedMotorcycle.brand.nameAr : selectedMotorcycle.brand.nameEn}{' '}
                    {selectedMotorcycle.model}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', fontFamily: 'monospace' }}>
                    {selectedMotorcycle.vin}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--blue-light)', marginTop: '0.5rem' }}>
                    {formatCurrency(selectedMotorcycle.price)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setStep('motorcycle');
                    setSelectedMotorcycle(null);
                    setDepositAmount('');
                    setDepositError('');
                  }}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.875rem' }}
                >
                  {t.change}
                </button>
              </div>
            </div>

            <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>{t.step3}</h2>

            <div className="pos-card">
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  {t.depositAmount} *
                </label>
                <div style={{ position: 'relative' }}>
                  <DollarSign
                    size={18}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      [isRtl ? 'right' : 'left']: '1rem',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-3)',
                    }}
                  />
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setDepositError('');
                    }}
                    placeholder={t.enterDeposit}
                    className="pos-input"
                    style={{
                      [isRtl ? 'paddingRight' : 'paddingLeft']: '3rem',
                      borderColor: depositError ? 'var(--red-light)' : undefined,
                    }}
                  />
                </div>
                {depositError && (
                  <div style={{ color: 'var(--red-light)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                    <AlertCircle size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                    {depositError}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem',
                  color: 'var(--text-2)',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span>{t.minimumDeposit}:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(getMinimumDeposit())}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem',
                  color: 'var(--text-2)',
                  marginTop: '0.5rem',
                }}
              >
                <span>{t.maximumDeposit}:</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(selectedMotorcycle.price)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                onClick={() => setStep('motorcycle')}
                className="btn btn-ghost"
                style={{ fontSize: '0.875rem' }}
              >
                {t.back}
              </button>
              <button
                onClick={handleDepositContinue}
                className="btn btn-primary"
                style={{ fontSize: '0.875rem' }}
              >
                {t.continue}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
