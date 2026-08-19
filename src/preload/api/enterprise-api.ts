import type {
  CorporateLlmAddEndpointResult,
  CorporateLlmEndpointStatus,
  CorporateLlmTokenSaveResult
} from '../../shared/corporate-llm-endpoint-status'
import type { EnterprisePolicyView } from '../../shared/enterprise-policy-view'
import type {
  GatewayLoginProgress,
  GatewayLoginResult,
  GatewayStatus
} from '../../shared/gateway-auth'
import type {
  GithubEnterpriseAuthStatus,
  GithubEnterpriseLoginProgress,
  GithubEnterpriseLoginResult
} from '../../shared/github-enterprise-auth'

// The token is write-only across this boundary: it goes in, and only `hasToken` comes back.
export type CorporateLlmApi = {
  listEndpoints: () => Promise<CorporateLlmEndpointStatus[]>
  saveToken: (args: { endpointId: string; token: string }) => Promise<CorporateLlmTokenSaveResult>
  clearToken: (args: { endpointId: string }) => Promise<CorporateLlmTokenSaveResult>
  addUserEndpoint: (args: {
    label: string
    baseUrl: string
    api: 'anthropic' | 'openai'
    model: string | null
  }) => Promise<CorporateLlmAddEndpointResult>
  removeUserEndpoint: (args: { endpointId: string }) => Promise<void>
}

export type EnterprisePolicyApi = {
  get: () => Promise<EnterprisePolicyView>
  /** Blocking read for gates evaluated before the async one can resolve. */
  getSync: () => EnterprisePolicyView | null
}

// No logout and no login argument: the gateway CLI owns the credential end to end.
export type GatewayApi = {
  getStatus: () => Promise<GatewayStatus>
  login: () => Promise<GatewayLoginResult>
  cancelLogin: () => Promise<void>
  onLoginProgress: (callback: (progress: GatewayLoginProgress) => void) => () => void
}

export type GithubEnterpriseApi = {
  getStatus: () => Promise<GithubEnterpriseAuthStatus>
  setHost: (args: { host: string }) => Promise<GithubEnterpriseAuthStatus>
  login: (args: { host: string }) => Promise<GithubEnterpriseLoginResult>
  loginWithToken: (args: { host: string; token: string }) => Promise<GithubEnterpriseLoginResult>
  logout: (args: { host: string }) => Promise<void>
  onLoginProgress: (callback: (progress: GithubEnterpriseLoginProgress) => void) => () => void
}
