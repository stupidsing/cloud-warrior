import { createBucket } from './bucket';
import { prefix } from './constants';
import { createDistribution } from './distribution';
import { createHostedZone } from './hostedZone';
import { createInstance } from './instance';
import { createInstanceProfile } from './instanceProfile';
import { createInternetGateway } from './internetGateway';
import { createInternetGatewayAttachment } from './internetGatewayAttachment';
import { createListener } from './listener';
import { createLoadBalancer } from './loadBalancer';
import { createNatGateway } from './natGateway';
import { createPolicy } from './policy';
import { createRecord } from './record';
import { createRole } from './role';
import { createSecurityGroup } from './securityGroup';
import { createSecurityGroupRuleIngress } from './securityGroupRule';
import { createSubnet } from './subnet';
import { createTarget } from './target';
import { createTargetGroup } from './targetGroup';
import { createVpc } from './vpc';
import { run } from './warrior';

run(process.env.ACTION ?? 'up', () => {
	let policy = createPolicy('policy-app', get => ({
		PolicyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: ['s3:ListBucket*', 's3:PutBucket*', 's3:GetBucket*'],
					Effect: 'Allow',
					Resource: ['arn:aws:s3:::app-bucket'],
				}
			],
		},
		PolicyName: `${prefix}-policy-app`,
	}));

	let role = createRole('role-app', get => ({
		AssumeRolePolicyDocument: {
			Version: '2012-10-17',
			Statement: [
				{
					Action: ['sts:AssumeRole'],
					Effect: 'Allow',
					Principal: { AWS: 'arn:aws:iam::805876202485:user/ywsing' },
				}
			]
		},
		Policies: [policy.getPolicyName(get)],
		RoleName: `${prefix}-role-app`,
	}));

	let instanceProfile = createInstanceProfile('instance-profile-app', get => ({
		InstanceProfileName: `${prefix}-instance-profile-app`,
		Roles: [{ RoleName: role.getRoleName(get) }],
	}));

	let bucket = createBucket('bucket', get => ({
		Name: 'npt-chat',
		Region: 'ap-southeast-1',
	}));

	let vpc = createVpc('vpc', get => ({
		CidrBlockAssociationSet: [{ CidrBlock: '10.88.0.0/16' }],
		EnableDnsHostnames: true,
		EnableDnsSupport: true,
	}));

	let publicSubnets = [
		{ AvailabilityZone: 'ap-southeast-1a', CidrBlock: '10.88.11.0/24' },
		{ AvailabilityZone: 'ap-southeast-1b', CidrBlock: '10.88.12.0/24' },
	].map(({ AvailabilityZone, CidrBlock }) => createSubnet('subnet-public', get => ({
		AvailabilityZone,
		CidrBlock,
		MapPublicIpOnLaunch: true,
		VpcId: vpc.getVpcId(get),
	})));

	let privateSubnets = [
		{ AvailabilityZone: 'ap-southeast-1a', CidrBlock: '10.88.21.0/24' },
		{ AvailabilityZone: 'ap-southeast-1b', CidrBlock: '10.88.22.0/24' },
	].map(({ AvailabilityZone, CidrBlock }) => createSubnet('subnet-private', get => ({
		AvailabilityZone,
		CidrBlock,
		MapPublicIpOnLaunch: false,
		VpcId: vpc.getVpcId(get),
	})));

	let internetGateway = createInternetGateway('igw', get => ({
	}));

	let internetGatewayAttachment = createInternetGatewayAttachment('igw-a', get => ({
		Attachments: [{ VpcId: vpc.getVpcId(get) }],
		InternetGatewayId: internetGateway.getInternetGatewayId(get),
	}));

	let natGateways = privateSubnets.map(subnet => createNatGateway('ngw', get => ({
		SubnetId: subnet.getSubnetId(get),
	})));

	let securityGroup = createSecurityGroup('sg-app', get => ({
		Description: '-',
		GroupName: `${prefix}-sg-app`,
		VpcId: vpc.getVpcId(get),
	}));

	let securityGroupRule = createSecurityGroupRuleIngress('sg-app-rule-ingress-80', get => ({
		CidrIpv4: '10.88.0.0/16',
		FromPort: 80,
		GroupId: securityGroup.getSecurityGroupId(get),
		IpProtocol: 'TCP',
		// SourceGroup: securityGroup.getSecurityGroupId(get),
		ToPort: 80,
	}));

	let instance = createInstance('instance-0', get => ({
		IamInstanceProfile: { Arn: instanceProfile.getArn(get) },
		ImageId: 'ami-05d6d0aae066c8d93', // aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id | jq -r .Parameter.Value
		InstanceType: 't3.nano',
		SecurityGroups: [{ GroupId: securityGroup.getSecurityGroupId(get) }],
		SubnetId: privateSubnets[0].getSubnetId(get),
	}));

	let loadBalancer = createLoadBalancer('alb', get => ({
		AvailabilityZones: publicSubnets.map(subnet => ({ SubnetId: subnet.getSubnetId(get) })),
		Name: 'alb',
		SecurityGroups: [securityGroup.getSecurityGroupId(get)],
	}));

	let targetGroup = createTargetGroup('tg', get => ({
		Dummy: internetGatewayAttachment.getInternetGatewayId(get), // dependency
		Name: `${prefix}-tg`,
		Protocol: 'HTTP',
		Port: 80,
		TargetType: 'instance',
		VpcId: vpc.getVpcId(get),
	}));

	let listener = createListener('listener', get => ({
		DefaultActions: [{ TargetGroupArn: targetGroup.getArn(get), Type: 'forward' }],
		LoadBalancerArn: loadBalancer.getArn(get),
		Port: 80,
		Protocol: 'HTTP',
	}));

	let target = createTarget('target', get => ({
		Target: { Id: instance.getInstanceId(get) },
		TargetGroupArn: targetGroup.getArn(get),
	}));

	let distribution = createDistribution('dist', get => ({
		DistributionConfig: {
			DefaultRootObject: 'index.html',
			Origins: { Items: [{ DomainName: 'npt.com' }]},
		},
	}));

	let hostedZone = createHostedZone('zone', get => ({
		Name: 'npt.com',
		CallerReference: '862c3944-6b5a-11ef-8195-7f23c933da52',
	}));

	let record = createRecord('record', get => ({
		HostedZoneId: hostedZone.getId(get),
		Name: 'rec.npt.com.',
		ResourceRecords: [{ Value: '"abcdef"' }],
		TTL: 300,
		Type: 'TXT',
	}));

	// s3
	// ACM certificate
	// HTTPS
	// domain name
	// cloudfront
	// RDS
	// ...
});
