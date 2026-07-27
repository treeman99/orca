import { describe, expect, it } from 'vitest'
import { parseAwsConfigSsoProfiles } from './aws-config-sso-profiles'

describe('parseAwsConfigSsoProfiles', () => {
  it('resolves a profile that points at an sso-session block', () => {
    const config = [
      '[sso-session corp]',
      'sso_start_url = https://corp.awsapps.com/start',
      'sso_region = us-east-1',
      '',
      '[profile bedrock]',
      'sso_session = corp',
      'sso_account_id = 123456789012',
      'sso_role_name = BedrockUser',
      'region = us-east-1'
    ].join('\n')

    expect(parseAwsConfigSsoProfiles(config)).toEqual([
      {
        name: 'bedrock',
        startUrl: 'https://corp.awsapps.com/start',
        ssoRegion: 'us-east-1',
        accountId: '123456789012',
        roleName: 'BedrockUser',
        sessionName: 'corp'
      }
    ])
  })

  it('reads the legacy shape where the profile carries the portal URL', () => {
    const config = [
      '[profile legacy]',
      'sso_start_url=https://corp.awsapps.com/start',
      'sso_region=ap-northeast-2'
    ].join('\n')

    expect(parseAwsConfigSsoProfiles(config)).toEqual([
      {
        name: 'legacy',
        startUrl: 'https://corp.awsapps.com/start',
        ssoRegion: 'ap-northeast-2',
        accountId: null,
        roleName: null,
        sessionName: null
      }
    ])
  })

  it('names the unprefixed default section "default"', () => {
    const config = ['[default]', 'sso_start_url = https://corp.awsapps.com/start'].join('\n')
    expect(parseAwsConfigSsoProfiles(config).map((profile) => profile.name)).toEqual(['default'])
  })

  it('drops profiles with no resolvable start URL', () => {
    const config = [
      '[profile plain]',
      'region = us-east-1',
      '',
      '[profile dangling]',
      'sso_session = missing',
      '',
      '[profile ok]',
      'sso_start_url = https://corp.awsapps.com/start'
    ].join('\n')

    expect(parseAwsConfigSsoProfiles(config).map((profile) => profile.name)).toEqual(['ok'])
  })

  it('ignores comments, blank lines, and unrelated section types', () => {
    const config = [
      '# corporate config',
      '[services shared]',
      'sso_start_url = https://not-a-profile.example/start',
      '',
      '[profile dev] ; inline comment on the header',
      'sso_start_url = https://corp.awsapps.com/start  # inline comment',
      '; sso_role_name = Commented'
    ].join('\n')

    expect(parseAwsConfigSsoProfiles(config)).toEqual([
      {
        name: 'dev',
        startUrl: 'https://corp.awsapps.com/start',
        ssoRegion: null,
        accountId: null,
        roleName: null,
        sessionName: null
      }
    ])
  })

  it('does not let a nested block’s keys leak into the profile', () => {
    const config = [
      '[profile nested]',
      'sso_start_url = https://corp.awsapps.com/start',
      's3 =',
      '  sso_role_name = NotARole',
      '  max_concurrent_requests = 20',
      'sso_role_name = RealRole'
    ].join('\n')

    expect(parseAwsConfigSsoProfiles(config)[0].roleName).toBe('RealRole')
  })

  it('keeps the first definition when a profile name repeats', () => {
    const config = [
      '[profile dup]',
      'sso_start_url = https://first.awsapps.com/start',
      '[profile dup]',
      'sso_start_url = https://second.awsapps.com/start'
    ].join('\n')

    const profiles = parseAwsConfigSsoProfiles(config)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].startUrl).toBe('https://first.awsapps.com/start')
  })

  it('returns nothing for an empty file', () => {
    expect(parseAwsConfigSsoProfiles('')).toEqual([])
  })
})
