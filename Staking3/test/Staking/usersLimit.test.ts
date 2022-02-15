import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { mineBlock, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


xdescribe('Users limit verification', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    let eva : SignerWithAddress;
    
    let testContext : TestContext;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
        
        for (let i = 0; i < 3; ++i) {
            await testContext.createRewardPool(
                'rewardA',
                tokenFormat(100),
                100000
            );
        }
    });
    
    
    it('Handles 100 users', async function() {
        this.timeout(60 * 1000);
        
        for (let i = 0; i < 100; ++i) {
            const address = '0x' + Number(i + 10).toString(16).padStart(40, '0');
            
            await network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [ address ],
            });
            const account = await ethers.getSigner(address);
            
            // send some ethers
            await owner.sendTransaction({
                value: ethers.utils.parseEther('5'),
                to: address,
            });
            await mineBlock();
            
            const txs = [];
            
            // send tokens
            {
                const tx = await testContext.tokenContracts.staking
                    .connect(owner)
                    .transfer(account.address, tokenFormat(100));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // approve
            {
                const tx = await testContext.tokenContracts.staking
                    .connect(account)
                    .approve(
                        testContext.stakingContract.address,
                        tokenFormat(100)
                    );
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // stake
            {
                const tx = await testContext.stakingContract
                    .connect(account)
                    .stake(tokenFormat(100));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                expect(result.gasUsed.toNumber()).to.be.lessThanOrEqual(400000);
            }
        }
    });
    
});
