import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { PasswordField } from '@/components/password-field';
import { GENDER_OPTIONS, useUser, type Gender } from '@/context/GoalContext';
import {
  EMAIL_RULE_TEXT,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  PASSWORD_RULE_TEXT,
  USERNAME_RULE_TEXT,
} from '@/lib/password';

// ---------------------------------------------------------------------------
// Mock akış: Register -> Login -> Welcome -> Survey -> Result
// Tamamı useState ile yönetilir, dosya/route bazlı navigasyon kullanılmaz.
// ---------------------------------------------------------------------------

type Screen = 'register' | 'login' | 'welcome' | 'survey' | 'result';

type ProfileKey = 'chaos' | 'procrastinator' | 'enthusiast' | 'perfectionist';

const PROFILE_LABELS: Record<ProfileKey, string> = {
  chaos: 'KAOS YOLCUSU',
  procrastinator: 'KRONİK ERTELEYİCİ',
  enthusiast: 'HEVESLİ ÇAYLAK',
  perfectionist: 'KUSURSUZLUK BEKÇİSİ',
};

const PROFILE_DESCRIPTIONS: Record<ProfileKey, string> = {
  chaos: 'Planın yok, akışa bırakıyorsun. İşe yarıyor ama pahalıya patlıyor.',
  procrastinator: '"Yarın" senin en sadık dostun. Baskı olmadan hiçbir şey ilerlemiyor.',
  enthusiast: 'İlk gün ateşlisin, üçüncü gün yoksun. Kıvılcım var, yakıt yok.',
  perfectionist: 'Mükemmel olmayan hiçbir şeye başlamıyorsun. Bu yüzden çoğu şeye hiç başlamıyorsun.',
};

type Option = { label: string; profile: ProfileKey };
type Question = { prompt: (name: string) => string; options: Option[] };

const QUESTIONS: Question[] = [
  {
    prompt: (name) => `${name}, yeni bir kararı uygularken genelde ne olur?`,
    options: [
      { label: 'Plansız başlarım, işler karışınca yön değiştiririm.', profile: 'chaos' },
      { label: 'Aslında başlamayı hep "yarına" bırakırım.', profile: 'procrastinator' },
      { label: 'Çok heyecanlanırım ama birkaç gün sonra hevesim söner.', profile: 'enthusiast' },
      { label: 'Her şey mükemmel olmadan asla başlamam.', profile: 'perfectionist' },
    ],
  },
  {
    prompt: (name) => `${name}, bir hedefe ulaşamadığında ne hissedersin?`,
    options: [
      { label: 'Zaten net bir planım yoktu, şaşırmam.', profile: 'chaos' },
      { label: 'Kendimi suçlarım ama yine de ertelerim.', profile: 'procrastinator' },
      { label: 'Hayal kırıklığına uğrarım, hemen yeni bir hedefe atlarım.', profile: 'enthusiast' },
      { label: 'Yeterince iyi olmadığımı düşünürüm.', profile: 'perfectionist' },
    ],
  },
  {
    prompt: (name) => `${name}, bir görevi bitirmek için sana en çok ne yardımcı olur?`,
    options: [
      { label: 'Anlık motivasyon ve heyecan.', profile: 'chaos' },
      { label: 'Sıkı bir son tarih ve üzerimde baskı olması.', profile: 'procrastinator' },
      { label: 'Yeni ve ilgi çekici bir şey olması.', profile: 'enthusiast' },
      { label: 'Net kurallar ve kusursuz bir plan.', profile: 'perfectionist' },
    ],
  },
];

function calculateProfile(answers: ProfileKey[]): ProfileKey {
  const counts: Record<ProfileKey, number> = {
    chaos: 0,
    procrastinator: 0,
    enthusiast: 0,
    perfectionist: 0,
  };
  answers.forEach((profile) => {
    counts[profile] += 1;
  });

  let best: ProfileKey = 'chaos';
  let bestCount = -1;
  (Object.keys(counts) as ProfileKey[]).forEach((key) => {
    if (counts[key] > bestCount) {
      bestCount = counts[key];
      best = key;
    }
  });
  return best;
}

export default function App() {
  const router = useRouter();
  const { user, registerAccount, authenticate, isReady, isLoggedIn, login, profile, setProfile } = useUser();
  const [screen, setScreen] = useState<Screen>('login');

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerSurname, setRegisterSurname] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerGender, setRegisterGender] = useState<Gender | null>(null);
  const [registerError, setRegisterError] = useState('');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Survey state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<ProfileKey[]>([]);
  const [resultProfile, setResultProfile] = useState<ProfileKey | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [openHomeFromSession, setOpenHomeFromSession] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (isLoggedIn && user) {
      setOpenHomeFromSession(true);
      router.replace({ pathname: '/home', params: { profile: profile ?? '' } });
    }
    setSessionChecked(true);
    // Sadece açılıştaki hydrate: login() anketi atlamasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const registerPasswordsMatch =
    registerPassword.length > 0 && registerPassword === registerConfirmPassword;
  const registerPasswordValid = isValidPassword(registerPassword);
  const registerEmailValid = isValidEmail(registerEmail);
  const registerUsernameValid = isValidUsername(registerUsername);
  const canRegister =
    registerName.trim().length > 0 &&
    registerSurname.trim().length > 0 &&
    registerEmailValid &&
    registerUsernameValid &&
    registerPasswordValid &&
    registerPasswordsMatch &&
    registerGender !== null;

  function handleRegister() {
    if (
      !registerName.trim() ||
      !registerSurname.trim() ||
      !registerEmail.trim() ||
      !registerUsername.trim() ||
      !registerPassword.trim()
    ) {
      setRegisterError('Lütfen tüm alanları doldur.');
      return;
    }
    if (!isValidEmail(registerEmail)) {
      setRegisterError(EMAIL_RULE_TEXT);
      return;
    }
    if (!isValidUsername(registerUsername)) {
      setRegisterError(USERNAME_RULE_TEXT);
      return;
    }
    if (!isValidPassword(registerPassword)) {
      setRegisterError(PASSWORD_RULE_TEXT);
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('Şifreler eşleşmiyor.');
      return;
    }
    if (!registerGender) {
      setRegisterError('Cinsiyet seçimi zorunlu.');
      return;
    }
    const created = registerAccount({
      name: registerName.trim(),
      surname: registerSurname.trim(),
      username: registerUsername.trim(),
      email: registerEmail.trim().toLowerCase(),
      password: registerPassword,
      avatarUri: null,
      gender: registerGender,
    });
    if (created === 'email') {
      setRegisterError('Bu e-posta zaten kayıtlı.');
      return;
    }
    if (created === 'username') {
      setRegisterError('Bu kullanıcı adı alınmış.');
      return;
    }
    setRegisterError('');
    setScreen('login');
  }

  function handleLogin() {
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setLoginError('Lütfen tüm alanları doldur.');
      return;
    }
    if (!authenticate(loginIdentifier.trim(), loginPassword)) {
      setLoginError('Kullanıcı adı, e-posta veya şifre hatalı.');
      return;
    }
    setLoginError('');
    login();
    if (profile) {
      router.replace({ pathname: '/home', params: { profile } });
      return;
    }
    setScreen('welcome');
  }

  function handleGoToRegister() {
    setLoginError('');
    setRegisterConfirmPassword('');
    setScreen('register');
  }

  function handleGoToLogin() {
    setRegisterError('');
    setScreen('login');
  }

  function handleGoToHome() {
    if (!resultProfile) return;
    setProfile(resultProfile);
    router.replace({ pathname: '/home', params: { profile: resultProfile } });
  }

  function handleStartSurvey() {
    setCurrentQuestion(0);
    setAnswers([]);
    setResultProfile(null);
    setScreen('survey');
  }

  function handleAnswer(profile: ProfileKey) {
    const nextAnswers = [...answers, profile];
    if (currentQuestion + 1 < QUESTIONS.length) {
      setAnswers(nextAnswers);
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setAnswers(nextAnswers);
      setResultProfile(calculateProfile(nextAnswers));
      setScreen('result');
    }
  }

  const displayName = user?.name || registerName.trim() || 'Kullanıcı';

  if (!isReady || !sessionChecked || openHomeFromSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.centeredContainer}>
          <Text style={styles.loadingText}>YÜKLENİYOR</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {screen === 'register' && (
        <FormScreen title="KAYIT OL">
          <View style={styles.fieldRow}>
            <TextInput
              value={registerName}
              onChangeText={setRegisterName}
              placeholder="İsim"
              placeholderTextColor="#6B6B6B"
              style={[styles.input, styles.fieldHalf]}
              autoCapitalize="words"
            />
            <TextInput
              value={registerSurname}
              onChangeText={setRegisterSurname}
              placeholder="Soyisim"
              placeholderTextColor="#6B6B6B"
              style={[styles.input, styles.fieldHalf]}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <TextInput
                value={registerEmail}
                onChangeText={setRegisterEmail}
                placeholder="E-posta"
                placeholderTextColor="#6B6B6B"
                style={[
                  styles.input,
                  registerEmail.length > 0 && !registerEmailValid && styles.inputMismatch,
                ]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
              {registerEmail.length > 0 && !registerEmailValid && (
                <Text style={styles.fieldError}>{EMAIL_RULE_TEXT}</Text>
              )}
            </View>
            <View style={styles.fieldHalf}>
              <TextInput
                value={registerUsername}
                onChangeText={setRegisterUsername}
                placeholder="Kullanıcı adı"
                placeholderTextColor="#6B6B6B"
                style={[
                  styles.input,
                  registerUsername.length > 0 && !registerUsernameValid && styles.inputMismatch,
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
              />
              {registerUsername.length > 0 && !registerUsernameValid && (
                <Text style={styles.fieldError}>{USERNAME_RULE_TEXT}</Text>
              )}
            </View>
          </View>
          <Text style={styles.sectionLabel}>CİNSİYET</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((option) => {
              const selected = registerGender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.genderButton, selected && styles.genderButtonActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setRegisterGender(option.value);
                    setRegisterError('');
                  }}>
                  <Text style={[styles.genderLabel, selected && styles.genderLabelActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <PasswordField
            value={registerPassword}
            onChangeText={(text) => {
              setRegisterPassword(text);
              setRegisterError('');
            }}
            placeholder="Şifre"
          />
          <Text style={styles.hintText}>{PASSWORD_RULE_TEXT}</Text>
          <PasswordField
            value={registerConfirmPassword}
            onChangeText={(text) => {
              setRegisterConfirmPassword(text);
              setRegisterError('');
            }}
            placeholder="Şifreyi Onayla"
            style={
              registerConfirmPassword.length > 0 && !registerPasswordsMatch
                ? styles.inputMismatch
                : undefined
            }
          />
          {registerPassword.length > 0 && !registerPasswordValid && (
            <Text style={styles.errorText}>{PASSWORD_RULE_TEXT}</Text>
          )}
          {registerConfirmPassword.length > 0 && !registerPasswordsMatch && (
            <Text style={styles.errorText}>Şifreler eşleşmiyor.</Text>
          )}
          {!!registerError && <Text style={styles.errorText}>{registerError}</Text>}
          <TouchableOpacity
            style={[styles.button, !canRegister && styles.buttonDisabled]}
            activeOpacity={0.85}
            onPress={handleRegister}
            disabled={!canRegister}>
            <Text style={styles.buttonLabel}>KAYIT OL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkHit} activeOpacity={0.7} onPress={handleGoToLogin}>
            <Text style={styles.linkText}>
              Zaten hesabın var mı? <Text style={styles.linkTextStrong}>Giriş Yap</Text>
            </Text>
          </TouchableOpacity>
        </FormScreen>
      )}

      {screen === 'login' && (
        <FormScreen title="GİRİŞ YAP">
          <TextInput
            value={loginIdentifier}
            onChangeText={setLoginIdentifier}
            placeholder="Kullanıcı Adı / E-posta"
            placeholderTextColor="#6B6B6B"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />
          <PasswordField
            value={loginPassword}
            onChangeText={setLoginPassword}
            placeholder="Şifre"
          />
          {!!loginError && <Text style={styles.errorText}>{loginError}</Text>}
          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={handleLogin}>
            <Text style={styles.buttonLabel}>GİRİŞ YAP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={handleGoToRegister}>
            <Text style={styles.secondaryButtonLabel}>KAYIT OL</Text>
          </TouchableOpacity>
        </FormScreen>
      )}

      {screen === 'welcome' && (
        <View style={styles.centeredContainer}>
          <Text style={styles.welcomeText}>
            <Text style={styles.welcomeName}>{displayName}</Text> hoş geldin, uygulamamızı tercih
            ettiğin için teşekkürler. Şimdi hazırsan seni 3 soruluk bir ankete davet ediyorum.
          </Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={handleStartSurvey}>
            <Text style={styles.buttonLabel}>ANKETE BAŞLA</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'survey' && (
        <View style={styles.container}>
          <Text style={styles.progressText}>
            SORU {currentQuestion + 1} / {QUESTIONS.length}
          </Text>
          <Text style={styles.questionText}>
            {QUESTIONS[currentQuestion].prompt(displayName)}
          </Text>
          <View style={styles.optionsWrapper}>
            {QUESTIONS[currentQuestion].options.map((option) => (
              <TouchableOpacity
                key={option.profile}
                style={styles.optionButton}
                activeOpacity={0.75}
                onPress={() => handleAnswer(option.profile)}>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {screen === 'result' && resultProfile && (
        <View style={styles.centeredContainer}>
          <Text style={styles.resultTitle}>
            ANALİZ TAMAMLANDI. SEN BİR {PROFILE_LABELS[resultProfile]}&apos;SIN.
          </Text>
          <Text style={styles.resultDescription}>{PROFILE_DESCRIPTIONS[resultProfile]}</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={handleGoToHome}>
            <Text style={styles.buttonLabel}>HAYDİ BAŞLAYALIM</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function FormScreen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.formScrollContent}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  container: {
    flex: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  formScrollContent: {
    flexGrow: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#050505',
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 1,
  },
  form: {
    marginTop: 40,
    gap: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  fieldHalf: {
    flex: 1,
    gap: 6,
  },
  fieldError: {
    color: '#FF5C5C',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  sectionLabel: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  genderRow: {
    gap: 8,
  },
  genderButton: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  genderButtonActive: {
    borderColor: '#C1121F',
    backgroundColor: '#1A0A0C',
  },
  genderLabel: {
    color: '#C8C8C8',
    fontSize: 14,
    fontWeight: '600',
  },
  genderLabelActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    color: '#F5F5F5',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
  },
  inputMismatch: {
    borderColor: '#C1121F',
  },
  errorText: {
    color: '#FF5C5C',
    fontSize: 13,
    fontWeight: '600',
  },
  hintText: {
    color: '#8A8A8A',
    fontSize: 12,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#C1121F',
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    alignSelf: 'stretch',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  secondaryButton: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    alignSelf: 'stretch',
  },
  secondaryButtonLabel: {
    color: '#E4E4E4',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  linkHit: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  linkText: {
    color: '#8A8A8A',
    fontSize: 14,
  },
  linkTextStrong: {
    color: '#C8C8C8',
    fontWeight: '700',
  },
  welcomeText: {
    color: '#C7C7C7',
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '500',
    textAlign: 'center',
  },
  welcomeName: {
    color: '#F5F5F5',
    fontWeight: '800',
  },
  progressText: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  questionText: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    marginTop: 16,
    marginBottom: 28,
  },
  optionsWrapper: {
    gap: 12,
  },
  optionButton: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionLabel: {
    color: '#E4E4E4',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  resultTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 38,
  },
  resultDescription: {
    color: '#9A9A9A',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  loadingText: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
