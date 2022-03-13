import { Ownable, OwnershipGrantedEvent } from '@/Ownable';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Factory } from './fixtures/contracts';
import { assertErrorMessage, findEvent } from './helpers/utils';

const contractsToTest = [
    'Ownable',
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`${contractName} is Ownable`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Ownable;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any> await Factory[contractName]();
        });
        
        it('Should define proper initial values', async() => {
            const masterOwner = await contract.masterOwner();
            expect(masterOwner).to.be.equal(owner.address);
            
            const isOwner = await contract.isOwner(owner.address);
            expect(isOwner).to.be.true;
        });
        
        it('Be able to change master ownership by master owner', async() => {
            {
                const tx = await contract.connect(owner)
                    .changeMasterOwnership(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            const masterOwner = await contract.masterOwner();
            expect(masterOwner).to.be.equal(alice.address);
            
            const isAliceOwner = await contract.isOwner(alice.address);
            expect(isAliceOwner).to.be.true;
            
            const isOwnerOwner = await contract.isOwner(owner.address);
            expect(isOwnerOwner).to.be.true;
        });
        
        it('Not be able to change master ownership by non master owner', async() => {
            // try to change master with non master
            {
                const tx = contract.connect(alice)
                    .changeMasterOwnership(alice.address);
                await assertErrorMessage(tx, 'OnlyMasterOwnerAllowed()');
                
                const masterOwner = await contract.masterOwner();
                expect(masterOwner).to.be.equal(owner.address);
                
                const isOwner = await contract.isOwner(alice.address);
                expect(isOwner).to.be.false;
            }
            
            // successfully change master
            {
                const tx = await contract.connect(owner)
                    .changeMasterOwnership(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const masterOwner = await contract.masterOwner();
                expect(masterOwner).to.be.equal(alice.address);
                
                const isOwner = await contract.isOwner(owner.address);
                expect(isOwner).to.be.true;
            }
            
            // try again change master with old master account
            {
                const tx = contract.connect(owner)
                    .changeMasterOwnership(owner.address);
                await assertErrorMessage(tx, 'OnlyMasterOwnerAllowed()');
                
                const masterOwner = await contract.masterOwner();
                expect(masterOwner).to.be.equal(alice.address);
                
                const isOwner = await contract.isOwner(owner.address);
                expect(isOwner).to.be.true;
            }
        });
        
        it('Add new owner allowed by master owner', async() => {
            {
                const isOwner = await contract.isOwner(alice.address);
                expect(isOwner).to.be.false;
            }
            
            // add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<OwnershipGrantedEvent>(result, 'OwnershipGranted');
                expect(event.args).to.containSubset([ alice.address ]);
                
                const isOwner = await contract.isOwner(alice.address);
                expect(isOwner).to.be.true;
            }
            
            // repeat (should not generate second event)
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                expect(result.events?.length).to.be.equal(0);
            }
            
            // try to add ownership to bob by alice with basic ownership
            {
                const tx = await contract.connect(owner)
                    .addOwner(bob.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<OwnershipGrantedEvent>(result, 'OwnershipGranted');
                expect(event.args).to.containSubset([ bob.address ]);
                
                const isAliceOwner = await contract.isOwner(alice.address);
                expect(isAliceOwner).to.be.true;
                const isBobOwner = await contract.isOwner(alice.address);
                expect(isAliceOwner).to.be.true;
            }
        });
        
        it('Not be able to add new owner by non master owner', async() => {
            // try to add ownership by simple user
            {
                const tx = contract.connect(alice)
                    .addOwner(alice.address);
                await assertErrorMessage(tx, 'OnlyMasterOwnerAllowed()');
                
                const isAliceOwner = await contract.isOwner(alice.address);
                expect(isAliceOwner).to.be.false;
            }
            
            // successfully add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // try to add ownership to bob by basic owner alice
            {
                const tx = contract.connect(alice)
                    .addOwner(bob.address);
                await assertErrorMessage(tx, 'OnlyMasterOwnerAllowed()');
                
                const isBobOwner = await contract.isOwner(bob.address);
                expect(isBobOwner).to.be.false;
            }
        });
        
        it('Revoke owner allowed by master owner', async() => {
            // first add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // try to revoke ownership from alice
            {
                const tx = await contract.connect(owner)
                    .revokeOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<OwnershipGrantedEvent>(result, 'OwnershipRevoked');
                expect(event.args).to.containSubset([ alice.address ]);
                
                const isOwner = await contract.isOwner(alice.address);
                expect(isOwner).to.be.false;
            }
            
            // should fail with non owner account
            {
                const tx = contract.connect(owner)
                    .revokeOwner(alice.address);
                await assertErrorMessage(tx, 'WrongAccount()');
            }
            
            {
                const tx = contract.connect(owner)
                    .revokeOwner(bob.address);
                await assertErrorMessage(tx, 'WrongAccount()');
            }
        });
        
        it('Not be able to revoke owner by non master account', async() => {
            // first add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // try to revoke with non master account
            {
                const tx = contract.connect(alice)
                    .revokeOwner(alice.address);
                await assertErrorMessage(tx, 'OnlyMasterOwnerAllowed()');
            }
        });
        
    });
    
});
