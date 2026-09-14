import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import {
  AuthResponse,
  ChangeEmailRequest,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  UserResponse,
} from './models';
import { environment } from '../../environments/environment';
import { clearCachedApiData } from './data-cache';

const ACCESS_TOKEN_KEY = 'finscope.accessToken';
const REFRESH_TOKEN_KEY = 'finscope.refreshToken';
const USER_KEY = 'finscope.user';

/**
 * Guarda la sesión y habla con los endpoints de /auth.
 * Los tokens viven en localStorage para que recargar la página no cierre la sesión; el
 * token de refresco es de un solo uso, así que cada renovación reemplaza el par completo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** Origen de la API, vacío en desarrollo. Ver `src/environments`. */
  private readonly api = environment.apiUrl;

  private readonly accessTokenSignal = signal<string | null>(
    localStorage.getItem(ACCESS_TOKEN_KEY),
  );
  private readonly userSignal = signal<UserResponse | null>(readStoredUser());

  /** Renovación en curso, mientras la haya, para no consumir el refresco dos veces. */
  private renewal: Observable<AuthResponse> | null = null;

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.accessTokenSignal() !== null);

  get accessToken(): string | null {
    return this.accessTokenSignal();
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/register`, request)
      .pipe(tap((auth) => this.storeSession(auth)));
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/login`, request)
      .pipe(tap((auth) => this.storeSession(auth)));
  }

  /** Consume el token de refresco actual y guarda el par nuevo que devuelve la API. */
  refresh(): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/refresh`, { refreshToken: this.refreshToken })
      .pipe(tap((auth) => this.storeSession(auth)));
  }

  /**
   * Renueva la sesión compartiendo una sola llamada entre todo el que la pida a la vez.
   *
   * El token de refresco es de un solo uso: si dos peticiones caducadas piden renovar cada
   * una por su cuenta, la segunda llega con un token ya consumido, falla, y se lleva por
   * delante el par bueno que acababa de traer la primera. Una pantalla lanza media docena de
   * peticiones a la vez, así que esto no es un caso raro sino el normal.
   *
   * @return la sesión renovada, la misma para todos los que la esperen
   */
  refreshOnce(): Observable<AuthResponse> {
    if (!this.renewal) {
      this.renewal = this.refresh().pipe(
        finalize(() => {
          this.renewal = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.renewal;
  }

  me(): Observable<UserResponse> {
    return this.http.get<UserResponse>(`${this.api}/auth/me`);
  }

  /**
   * Cambia los datos del usuario y deja la sesión al día.
   * El nombre se ve en la barra superior nada más guardarlo, así que la copia local se
   * actualiza aquí en lugar de esperar a la siguiente recarga de la página.
   *
   *  request datos a cambiar
   *  el usuario ya actualizado
   */
  updateProfile(request: UpdateUserRequest): Observable<UserResponse> {
    return this.http
      .patch<UserResponse>(`${this.api}/auth/me`, request)
      .pipe(tap((user) => this.storeUser(user)));
  }

  /**
   * Pide que vuelvan a mandar el correo de verificación a la dirección de la cuenta.
   * La API responde en cuanto encola el mensaje, no cuando llega: que el correo tarde no es
   * algo que el usuario pueda arreglar esperando en la pantalla.
   *
   * @return la petición, que completa sin valor
   */
  sendEmailVerification(): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/verify-email`, {});
  }

  /**
   * Consume el enlace de verificación recibido por correo.
   *
   * @param token valor que viaja en la dirección del enlace
   * @return la petición, que completa sin valor
   */
  confirmEmailVerification(token: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/verify-email/confirm`, { token });
  }

  /**
   * Pide mover la cuenta a otra dirección. El correo no cambia hasta confirmarlo desde ella.
   *
   * @param request dirección nueva y contraseña en curso
   * @return la petición, que completa sin valor
   */
  requestEmailChange(request: ChangeEmailRequest): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/change-email`, request);
  }

  /**
   * Consume el enlace mandado a la dirección nueva y aplica el cambio.
   *
   * @param token valor que viaja en la dirección del enlace
   * @return la petición, que completa sin valor
   */
  confirmEmailChange(token: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/change-email/confirm`, { token });
  }

  /**
   * Pide el enlace con el que establecer una contraseña nueva.
   * Responde igual exista o no una cuenta con ese correo, así que la pantalla no puede
   * —ni debe— decir cuál de los dos casos es.
   *
   * @param email correo de la cuenta que quiere recuperarse
   * @return la petición, que completa sin valor
   */
  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/forgot-password`, { email });
  }

  /**
   * Establece la contraseña con el enlace recibido por correo.
   * Cierra además todas las sesiones abiertas, la de este navegador incluida, así que la
   * sesión local se limpia aquí: dejarla puesta enseñaría una aplicación que ya no responde.
   *
   * @param token    valor que viaja en la dirección del enlace
   * @param password contraseña nueva
   * @return la petición, que completa sin valor
   */
  resetPassword(token: string, password: string): Observable<void> {
    return this.http
      .post<void>(`${this.api}/auth/reset-password`, { token, password })
      .pipe(tap(() => this.clearSession()));
  }

  /** Vuelve a leer el usuario de la API y deja al día la copia de la sesión. */
  refreshUser(): Observable<UserResponse> {
    return this.me().pipe(tap((user) => this.storeUser(user)));
  }

  /** Revoca el token de refresco en el servidor y limpia la sesión local pase lo que pase. */
  logout(): Observable<void> {
    const refreshToken = this.refreshToken;
    return new Observable<void>((subscriber) => {
      const finish = () => {
        this.clearSession();
        subscriber.next();
        subscriber.complete();
      };
      if (!refreshToken) {
        finish();
        return;
      }
      this.http.post<void>(`${this.api}/auth/logout`, { refreshToken }).subscribe({
        next: finish,
        error: finish,
      });
    });
  }

  clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
    // La copia sin conexión se va con la sesión. El trabajador de servicio empareja por
    // dirección y no por credenciales, así que dejarla ahí significaría enseñarle los
    // movimientos de esta cuenta a la siguiente que entre en este navegador sin red. No se
    // espera a que termine: salir no puede quedarse colgado de un borrado.
    void clearCachedApiData();
  }

  /** Guarda el usuario en curso, sin tocar las credenciales. */
  private storeUser(user: UserResponse): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.userSignal.set(user);
  }

  private storeSession(auth: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    this.accessTokenSignal.set(auth.accessToken);
    this.userSignal.set(auth.user);
  }
}

function readStoredUser(): UserResponse | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserResponse;
  } catch {
    return null;
  }
}
