import { createDistribution } from './aws/cloudfront/distribution';
import { createInstance } from './aws/ec2/instance';
import { createInternetGateway } from './aws/ec2/internetGateway';
import { createInternetGatewayAttachment } from './aws/ec2/internetGatewayAttachment';
import { createListener } from './aws/ec2/listener';
import { createNatGateway } from './aws/ec2/natGateway';
import { createSecurityGroup } from './aws/ec2/securityGroup';
import { createSecurityGroupRuleIngress } from './aws/ec2/securityGroupRule';
import { createSubnet } from './aws/ec2/subnet';
import { createVpc } from './aws/ec2/vpc';
import { createLoadBalancer } from './aws/elbv2/loadBalancer';
import { createTarget } from './aws/elbv2/target';
import { createTargetGroup } from './aws/elbv2/targetGroup';
import { createInstanceProfile } from './aws/iam/instanceProfile';
import { createPolicy } from './aws/iam/policy';
import { createRole } from './aws/iam/role';
import { createEventSourceMapping } from './aws/lambda/eventSourceMapping';
import { createFunction } from './aws/lambda/function';
import { createHostedZone } from './aws/route53/hostedZone';
import { createRecord } from './aws/route53/record';
import { createBucket } from './aws/s3/bucket';
import { createIpSet } from './aws/wafv2/ipSet';
import { createWebAcl } from './aws/wafv2/webAcl';
import { prefix } from './constants';
import { run } from './warrior';

run(process.env.ACTION ?? 'up', () => {
	let allocationIds = ['eipalloc-090b790ec9c32c45f', 'eipalloc-0fb97b6a07242da71'];

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
	].map(({ AvailabilityZone, CidrBlock }, i) => createSubnet(`subnet-public${i}`, get => ({
		AvailabilityZone,
		CidrBlock,
		MapPublicIpOnLaunch: true,
		VpcId: vpc.getVpcId(get),
	})));

	let privateSubnets = [
		{ AvailabilityZone: 'ap-southeast-1a', CidrBlock: '10.88.21.0/24' },
		{ AvailabilityZone: 'ap-southeast-1b', CidrBlock: '10.88.22.0/24' },
	].map(({ AvailabilityZone, CidrBlock }, i) => createSubnet(`subnet-private${i}`, get => ({
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

	let natGateways = privateSubnets.map((subnet, i) => createNatGateway(`ngw-${i}`, get => ({
		NatGatewayAddresses: [{ AllocationId: allocationIds[i] }],
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

	let function_ = createFunction('function', get => ({
		Code: { ImageUri: 'https://image.com' },
		FunctionName: 'function',
		Role: role.getRoleName(get),
	}));

	let eventSourceMapping = createEventSourceMapping('event-source-mapping', get => ({
		FunctionName: function_.getFunctionName(get),
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

	let ipSet = createIpSet('ipset', get => ({
		Addresses: ['192.168.101.202/32'],
		IPAddressVersion: 'IPV4',
		Name: 'ipset',
		Region: 'us-east-1',
		Scope: 'CLOUDFRONT',
	}));

	let webAcl = createWebAcl('webacl', get => ({
		DefaultAction: {
			Allow: { CustomRequestHandling: { InsertHeaders: [] } },
			Block: {
				CustomResponse: {
					CustomResponseBodyKey:  '',
					ResponseCode: 403,
					ResponseHeaders: [],
				},
			},
		},
		Name: 'webacl',
		Region: 'us-east-1',
		Scope: 'CLOUDFRONT',
		VisibilityConfig: {
			CloudWatchMetricsEnabled: false,
			MetricName: 'metric',
			SampleRequestsEnabled: false,
		},
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

	// ACM certificate validation
	// RDS
	// WAFv2
	// ...
});
