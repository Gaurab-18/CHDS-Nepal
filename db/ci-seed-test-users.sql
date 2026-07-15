-- CI test users: matches credentials in backend/tests/*.test.ts
-- Password for all: @CHDS2024!

INSERT INTO users (id, username, email, password_hash, role, two_factor_enabled, active, onboarding_complete, token_version, is_verified)
VALUES
  (gen_random_uuid(), 'patient', 'patient@chds.np', crypt('@CHDS2024!', gen_salt('bf', 12)), 'patient',  false, true, true, 0, false),
  (gen_random_uuid(), 'doctor',  'doctor@chds.np',  crypt('@CHDS2024!', gen_salt('bf', 12)), 'doctor',   false, true, true, 0, true),
  (gen_random_uuid(), 'admin',   'admin@chds.np',   crypt('@CHDS2024!', gen_salt('bf', 12)), 'admin',    false, true, true, 0, false)
ON CONFLICT (email) DO NOTHING;

-- Patient profile for patient@chds.np
INSERT INTO patients (id, user_id, encrypted_first_name, encrypted_last_name, encrypted_dob, encrypted_phone, encrypted_address, encrypted_national_id)
SELECT gen_random_uuid(), id,
  pgp_sym_encrypt('Test', 'test-encryption-key-at-least-32-chars!!'),
  pgp_sym_encrypt('Patient', 'test-encryption-key-at-least-32-chars!!'),
  pgp_sym_encrypt('1990-01-01', 'test-encryption-key-at-least-32-chars!!'),
  pgp_sym_encrypt('1234567890', 'test-encryption-key-at-least-32-chars!!'),
  pgp_sym_encrypt('Main St', 'test-encryption-key-at-least-32-chars!!'),
  pgp_sym_encrypt('ABC123', 'test-encryption-key-at-least-32-chars!!')
FROM users WHERE email = 'patient@chds.np'
ON CONFLICT (user_id) DO NOTHING;

-- Doctor profile for doctor@chds.np
INSERT INTO doctor_profiles (id, user_id, full_name, hospital_name, license_number, verification_status)
SELECT gen_random_uuid(), id, 'Test Doctor', 'Test Hospital', 'LIC-001', 'approved'
FROM users WHERE email = 'doctor@chds.np'
ON CONFLICT (user_id) DO NOTHING;
