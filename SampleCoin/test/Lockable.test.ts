import { AccountLockChangedEvent, GlobalLockChangedEvent, Lockable, TransferEvent } from '@/Lockable';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Factory } from './fixtures/contracts';
import { assertErrorMessage, findEvent } from './helpers/utils';


const contractsToTest = [
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`${contractName} is Lockable`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Lockable;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any>await Factory[contractName]();
            
            // initial transfers
            {
                const tx = await contract.connect(owner)
                    .transfer(alice.address, 10000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const tx = await contract.connect(owner)
                    .transfer(bob.address, 10000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Allow locking only to owners', async() => {
            {
                const tx = contract.connect(alice)
                    .modifiyGlobalLock(true);
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            {
                const tx = contract.connect(alice)
                    .modifiyAccountLock(bob.address, true);
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            {
                const tx = await contract.connect(owner)
                    .modifiyGlobalLock(true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const tx = await contract.connect(owner)
                    .modifiyAccountLock(bob.address, true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly transfer funds without lock', async () => {
            {
                const tx = await contract.connect(owner)
                    .transfer(alice.address, 1000);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TransferEvent>(result, 'Transfer');
                expect(event.args).to.containSubset([
                    owner.address,
                    alice.address,
                ]);
                expect(event.args.value).to.be.equal(1000);
            }
            
            {
                const tx = await contract.connect(owner)
                    .transfer(bob.address, 1000);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<TransferEvent>(result, 'Transfer');
                expect(event.args).to.containSubset([
                    owner.address,
                    bob.address,
                ]);
                expect(event.args.value).to.be.equal(1000);
            }
        });
        
        it('Proper locking execution', async() => {
            // lock
            {
                const tx = await contract.connect(owner)
                    .modifiyGlobalLock(true);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<GlobalLockChangedEvent>(result, 'GlobalLockChanged');
                expect(event.args).to.containSubset([ owner.address, true ]);
            }
            
            // lock again (no event)
            {
                const tx = await contract.connect(owner)
                    .modifiyGlobalLock(true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                expect(result.events?.length).to.be.equal(0);
            }
            
            // unlock global
            {
                const tx = await contract.connect(owner)
                    .modifiyGlobalLock(false);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<GlobalLockChangedEvent>(result, 'GlobalLockChanged');
                expect(event.args).to.containSubset([ owner.address, false ]);
            }
            
            // lock account
            {
                const tx = await contract.connect(owner)
                    .modifiyAccountLock(bob.address, true);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<AccountLockChangedEvent>(result, 'AccountLockChanged');
                expect(event.args).to.containSubset([ owner.address, bob.address, true ]);
            }
            
            // again (no event)
            {
                const tx = await contract.connect(owner)
                    .modifiyAccountLock(bob.address, true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                expect(result.events?.length).to.be.equal(0);
            }
            
            // unlock
            {
                const tx = await contract.connect(owner)
                    .modifiyAccountLock(bob.address, false);
                const result = await tx.wait();
                
                expect(result.status).to.be.equal(1);
                
                const event = findEvent<AccountLockChangedEvent>(result, 'AccountLockChanged');
                expect(event.args).to.containSubset([ owner.address, bob.address, false ]);
            }
        });
        
        it('Check global lock', async() => {
            // check lock before locking
            {
                const isLocked = await contract.isLocked(alice.address);
                expect(isLocked).to.be.false;
                
                const tx = await contract.connect(alice)
                    .transfer(owner.address, 10);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const isLocked = await contract.isLocked(bob.address);
                expect(isLocked).to.be.false;
                
                const tx = await contract.connect(bob)
                    .transfer(owner.address, 10);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // actual locking
            {
                const tx = await contract.connect(owner)
                    .modifiyGlobalLock(true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // now it should be locked
            {
                const isLocked = await contract.isLocked(alice.address);
                expect(isLocked).to.be.true;
                
                const tx = contract.connect(alice)
                    .transfer(owner.address, 10);
                await assertErrorMessage(tx, 'AllAccountsLocked()');
            }
            {
                const isLocked = await contract.isLocked(bob.address);
                expect(isLocked).to.be.true;
                
                const tx = contract.connect(bob)
                    .transfer(owner.address, 10);
                await assertErrorMessage(tx, 'AllAccountsLocked()');
            }
        });
        
        it('Check account lock', async() => {
            // check lock before locking
            {
                const isLocked = await contract.isLocked(alice.address);
                expect(isLocked).to.be.false;
                
                const tx = await contract.connect(alice)
                    .transfer(owner.address, 10);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            {
                const isLocked = await contract.isLocked(bob.address);
                expect(isLocked).to.be.false;
                
                const tx = await contract.connect(bob)
                    .transfer(owner.address, 10);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // actual locking
            {
                const tx = await contract.connect(owner)
                    .modifiyAccountLock(alice.address, true);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // now it should be locked
            {
                const isLocked = await contract.isLocked(alice.address);
                expect(isLocked).to.be.true;
                
                const tx = contract.connect(alice)
                    .transfer(owner.address, 10);
                await assertErrorMessage(tx, 'AccountLocked()');
            }
            {
                const isLocked = await contract.isLocked(bob.address);
                expect(isLocked).to.be.false;
                
                const tx = await contract.connect(bob)
                    .transfer(owner.address, 10);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
    });
    
});
